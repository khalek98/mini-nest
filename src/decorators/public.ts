import "reflect-metadata";

export const IS_PUBLIC_KEY = Symbol("isPublic");

export function Public(): ClassDecorator & MethodDecorator {
  return (target: object, propertyKey?: string | symbol) => {
    if (propertyKey !== undefined) {
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, target, propertyKey);
    } else {
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
    }
  };
}
