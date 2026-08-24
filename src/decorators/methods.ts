import "reflect-metadata";

export const ROUTE_KEY = Symbol("route");

export type HttpMethod = "GET" | "POST";

function Route(httpMethod: HttpMethod, path = ""): MethodDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata(
      ROUTE_KEY,
      { httpMethod, path },
      target,
      propertyKey,
    );
  };
}

export const Get = (path = "") => Route("GET", path);
export const Post = (path = "") => Route("POST", path);
