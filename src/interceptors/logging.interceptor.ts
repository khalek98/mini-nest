import type { Next, RequestContext } from "../dispatcher.js";

export type Interceptor = (ctx: RequestContext, next: Next) => Promise<unknown>;

export class LoggingInterceptor {
  constructor(private readonly log: (line: string) => void = console.log) {}

  async intercept(ctx: RequestContext, next: Next): Promise<unknown> {
    const start = performance.now();
    const result = await next();
    const ms = (performance.now() - start).toFixed(1);
    this.log(`${ctx.httpMethod} ${ctx.route.path} — ${ms} ms`);
    return result;
  }
}

export function loggingInterceptor(
  log: (line: string) => void = console.log,
): Interceptor {
  const instance = new LoggingInterceptor(log);
  return (ctx, next) => instance.intercept(ctx, next);
}
