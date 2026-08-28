import type { Next, RequestContext } from "../dispatcher.js";

export type Middleware = (ctx: RequestContext, next: Next) => Promise<unknown>;

export const passThrough: Middleware = (_ctx, next) => next();

export function compose(middlewares: Middleware[]): Middleware {
  if (middlewares.length === 0) return passThrough;

  return (ctx, next) => {
    let index = -1;

    const dispatch = (i: number): Promise<unknown> => {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times"));
      }
      index = i;
      const fn = middlewares[i];
      if (!fn) return next();
      return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
    };

    return dispatch(0);
  };
}
