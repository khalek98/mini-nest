import "reflect-metadata";

export type InjectionToken = string | symbol | Function;

export const INJECT_KEY = Symbol("inject");

export function Inject(token: InjectionToken): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const tokens: InjectionToken[] =
      Reflect.getOwnMetadata(INJECT_KEY, target) ?? [];
    tokens[parameterIndex] = token;
    Reflect.defineMetadata(INJECT_KEY, tokens, target);
  };
}
