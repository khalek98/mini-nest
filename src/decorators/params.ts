import "reflect-metadata";

export const PARAMS_KEY = Symbol("params");

export type ParamMeta = {
  type: "body" | "param" | "query";
  name?: string;
};

function ParamDecorator(
  type: ParamMeta["type"],
  name?: string,
): ParameterDecorator {
  return (target, propertyKey, index) => {
    const existing: ParamMeta[] =
      Reflect.getOwnMetadata(PARAMS_KEY, target, propertyKey!) ?? [];

    existing[index] = name !== undefined ? { type, name } : { type };

    Reflect.defineMetadata(PARAMS_KEY, existing, target, propertyKey!);
  };
}

export const Body = () => ParamDecorator("body");
export const Param = (name: string) => ParamDecorator("param", name);
export const Query = (name: string) => ParamDecorator("query", name);
