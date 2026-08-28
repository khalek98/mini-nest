import type { RequestContext } from "../dispatcher.js";
import { IS_PUBLIC_KEY } from "../decorators/public.js";

export type Guard = (ctx: RequestContext) => boolean | Promise<boolean>;

function isPublicRoute(ctx: RequestContext): boolean {
  const { controller, handlerName } = ctx.route;
  const proto = controller.prototype;

  if (Reflect.getOwnMetadata(IS_PUBLIC_KEY, proto, handlerName)) {
    return true;
  }

  if (Reflect.getOwnMetadata(IS_PUBLIC_KEY, controller)) {
    return true;
  }

  return false;
}

export class AuthGuard {
  canActivate(ctx: RequestContext): boolean {
    if (isPublicRoute(ctx)) return true;
    const h = ctx.req.headers.authorization;
    return typeof h === "string" && h.length > 0;
  }
}

export function authGuard(ctx: RequestContext): boolean {
  return new AuthGuard().canActivate(ctx);
}
