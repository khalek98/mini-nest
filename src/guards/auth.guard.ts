import type { RequestContext } from "../dispatcher.js";

export type Guard = (ctx: RequestContext) => boolean | Promise<boolean>;

export class AuthGuard {
  canActivate(ctx: RequestContext): boolean {
    if (ctx.route.path === "/health") return true;
    const h = ctx.req.headers.authorization;
    return typeof h === "string" && h.length > 0;
  }
}

export function authGuard(ctx: RequestContext): boolean {
  return new AuthGuard().canActivate(ctx);
}
