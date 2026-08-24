import "reflect-metadata";
import http from "node:http";
import type { Container } from "./container.js";
import { collectRoutes, type RouteInfo } from "./router.js";
import { zodValidationPipe } from "./pipes/zod-validation.pipe.js";
import { type HttpMethod } from "./decorators/methods.js";
import { compose, passThrough, type Middleware } from "./middleware/compose.js";
import { type Guard } from "./guards/auth.guard.js";
import { type Interceptor } from "./interceptors/logging.interceptor.js";
import {
  exceptionFilter,
  InvalidJsonError,
  PayloadTooLargeError,
} from "./filters/exception.filter.js";

export type { Middleware } from "./middleware/compose.js";
export type { Guard } from "./guards/auth.guard.js";
export type { Interceptor } from "./interceptors/logging.interceptor.js";

const MAX_BODY_BYTES = 1024 * 1024;

export type Next = () => Promise<unknown>;

export type RequestContext = {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  route: RouteInfo;
  args: unknown[];
  instance: Record<string, (...a: unknown[]) => unknown>;
  httpMethod: HttpMethod;
};

export type LifecycleHooks = {
  onMiddleware?: (ctx: RequestContext) => void | Promise<void>;
  onGuard?: (ctx: RequestContext) => boolean | Promise<boolean>;
  onInterceptor?: (ctx: RequestContext, next: Next) => Promise<unknown>;
  onPipe?: (ctx: RequestContext) => void | Promise<void>;
};

function createHandlerStage(ctx: RequestContext): Next {
  return () =>
    Promise.resolve(ctx.instance[ctx.route.handlerName]!(...ctx.args));
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      reject(new PayloadTooLargeError());
      req.resume();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
      req.destroy();
    };

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new InvalidJsonError());
      }
    });
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function matchPath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]!;
    const pv = pathParts[i]!;
    if (pp.startsWith(":")) {
      params[pp.slice(1)] = pv;
    } else if (pp !== pv) {
      return null;
    }
  }
  return params;
}

function findRoute(
  routes: RouteInfo[],
  method: HttpMethod,
  pathname: string,
): { route: RouteInfo; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.httpMethod !== method) continue;
    const params = matchPath(route.path, pathname);
    if (params) return { route, params };
  }
  return null;
}

function pathMatchesAnyRoute(routes: RouteInfo[], pathname: string): boolean {
  return routes.some((route) => matchPath(route.path, pathname) !== null);
}

const PRIMITIVES = new Set([String, Number, Boolean, Object, Array]);

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function getHandlerParamtypes(
  controller: Function,
  handlerName: string,
): Function[] {
  let proto: object | null = controller.prototype;
  while (proto && proto !== Object.prototype) {
    const types = Reflect.getOwnMetadata(
      "design:paramtypes",
      proto,
      handlerName,
    ) as Function[] | undefined;
    if (types) return types;
    proto = Object.getPrototypeOf(proto);
  }
  return [];
}

async function applyBodyValidation(
  ctx: RequestContext,
  paramtypes: Function[],
): Promise<void> {
  for (let i = 0; i < ctx.route.params.length; i++) {
    const meta = ctx.route.params[i];
    if (!meta || meta.type !== "body") continue;

    const metatype = paramtypes[i] as (new (...a: any[]) => object) | undefined;
    if (metatype && !PRIMITIVES.has(metatype as any)) {
      ctx.args[i] = zodValidationPipe(ctx.args[i], metatype);
    }
  }
}

async function runGuards(
  ctx: RequestContext,
  guards: Guard[],
  onGuard: LifecycleHooks["onGuard"],
): Promise<boolean> {
  for (const guard of guards) {
    if (!(await guard(ctx))) return false;
  }
  if (onGuard && !(await onGuard(ctx))) return false;
  return true;
}

async function runLifecycle(
  ctx: RequestContext,
  paramtypes: Function[],
  hooks: LifecycleHooks,
  middleware: Middleware[],
  guards: Guard[],
  interceptors: Interceptor[],
): Promise<unknown> {
  const outer = compose(middleware);
  const intercept = compose(interceptors);

  return outer(ctx, async () => {
    const allowed = await runGuards(ctx, guards, hooks.onGuard);
    if (!allowed) {
      // Guard only returns false — dispatcher owns the 403 body (Nest CanActivate).
      sendJson(ctx.res, 403, { error: "Forbidden" });
      return undefined;
    }

    const inner =
      hooks.onInterceptor ?? ((_ctx: RequestContext, next: Next) => next());

    return intercept(ctx, () =>
      inner(ctx, async () => {
        await applyBodyValidation(ctx, paramtypes);
        await hooks.onPipe?.(ctx);
        return createHandlerStage(ctx)();
      }),
    );
  });
}

export type CreateAppOptions = {
  hooks?: LifecycleHooks;
  middleware?: Middleware[];
  /** Optional guards (e.g. authGuard). All must return true; false → 403. */
  guards?: Guard[];
  /** Optional interceptors (e.g. loggingInterceptor). First registered = outermost. */
  interceptors?: Interceptor[];
};

function resolveMiddleware(
  hooks: LifecycleHooks,
  middleware: Middleware[] | undefined,
): Middleware[] {
  const list = middleware?.length ? [...middleware] : [passThrough];

  if (hooks.onMiddleware) {
    const onMiddleware = hooks.onMiddleware;
    list.unshift(async (ctx, next) => {
      await onMiddleware(ctx);
      return next();
    });
  }

  return list;
}

export function createApp(
  container: Container,
  controllers: Function[],
  options: CreateAppOptions = {},
) {
  const hooks = options.hooks ?? {};
  const middleware = resolveMiddleware(hooks, options.middleware);
  const guards = options.guards ?? [];
  const interceptors = options.interceptors ?? [];
  const routes = collectRoutes(controllers);

  return http.createServer(async (req, res) => {
    try {
      const method = (req.method ?? "GET").toUpperCase() as HttpMethod;

      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );

      const found = findRoute(routes, method, url.pathname);
      if (!found) {
        if (pathMatchesAnyRoute(routes, url.pathname)) {
          sendJson(res, 405, { error: "Method Not Allowed" });
          return;
        }
        sendJson(res, 404, { error: "Not Found" });
        return;
      }

      const { route, params: pathParams } = found;
      const body = await readBody(req);
      const query = Object.fromEntries(url.searchParams.entries());

      const paramtypes = getHandlerParamtypes(
        route.controller,
        route.handlerName,
      );

      const args: unknown[] = [];

      for (let i = 0; i < route.params.length; i++) {
        const meta = route.params[i];
        if (!meta) continue;

        if (meta.type === "param") {
          args[i] = pathParams[meta.name!];
        } else if (meta.type === "query") {
          args[i] = query[meta.name!];
        } else if (meta.type === "body") {
          args[i] = body;
        }
      }

      const instance = container.resolve(
        route.controller as new (...a: any[]) => any,
      );

      const ctx: RequestContext = {
        req,
        res,
        route,
        args,
        instance,
        httpMethod: method,
      };

      const result = await runLifecycle(
        ctx,
        paramtypes,
        hooks,
        middleware,
        guards,
        interceptors,
      );
      if (res.headersSent) return;

      sendJson(res, method === "POST" ? 201 : 200, result ?? null);
    } catch (err) {
      exceptionFilter(err, res);
    }
  });
}
