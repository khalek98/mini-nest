import "reflect-metadata";
import { CONTROLLER_KEY } from "./decorators/controller.js";
import { type HttpMethod, ROUTE_KEY } from "./decorators/methods.js";
import { PARAMS_KEY, type ParamMeta } from "./decorators/params.js";

export type RouteInfo = {
  httpMethod: HttpMethod;
  path: string;
  controller: Function;
  handlerName: string;
  params: ParamMeta[];
};

function joinPath(prefix: string, path: string): string {
  const left = prefix.replace(/^\/|\/$/g, "");
  const right = path.replace(/^\/|\/$/g, "");
  if (!left && !right) return "/";
  if (!right) return `/${left}`;
  if (!left) return `/${right}`;
  return `/${left}/${right}`;
}

function countStaticSegments(path: string): number {
  return path
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith(":")).length;
}

export function collectRoutes(controllers: Function[]): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const controller of controllers) {
    const meta = Reflect.getOwnMetadata(CONTROLLER_KEY, controller) as
      | { prefix?: string }
      | undefined;
    const prefix = meta?.prefix ?? "";

    const seen = new Set<string>();
    let proto: object | null = controller.prototype;

    while (proto && proto !== Object.prototype) {
      const methodNames = Object.getOwnPropertyNames(proto);

      for (const handlerName of methodNames) {
        if (handlerName === "constructor") continue;
        if (seen.has(handlerName)) continue;

        const route = Reflect.getOwnMetadata(ROUTE_KEY, proto, handlerName) as
          | { httpMethod: HttpMethod; path: string }
          | undefined;
        if (!route) continue;

        seen.add(handlerName);

        // Own metadata only — do not use getMetadata (walks and mixes parents).
        const params: ParamMeta[] =
          Reflect.getOwnMetadata(PARAMS_KEY, proto, handlerName) ?? [];

        routes.push({
          httpMethod: route.httpMethod,
          path: joinPath(prefix, route.path),
          controller,
          handlerName,
          params,
        });
      }

      proto = Object.getPrototypeOf(proto);
    }
  }

  routes.sort(
    (a, b) => countStaticSegments(b.path) - countStaticSegments(a.path),
  );

  return routes;
}
