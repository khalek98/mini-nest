import "reflect-metadata";

export const CONTROLLER_KEY = Symbol("CONTROLLER");

export function Controller(prefix = ""): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(CONTROLLER_KEY, { prefix }, target);
  };
}
