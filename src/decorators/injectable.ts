import "reflect-metadata";

export const INJECTABLE_KEY = Symbol("injectable");
export const SCOPE_KEY = Symbol("scope");

export type Scope = "singleton" | "transient";

export interface InjectableOptions {
  scope?: Scope;
}

export function Injectable(options?: InjectableOptions): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(INJECTABLE_KEY, true, target);
    Reflect.defineMetadata(SCOPE_KEY, options?.scope ?? "singleton", target);
  };
}
