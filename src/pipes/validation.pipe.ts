import { plainToInstance } from "class-transformer";
import { validate, type ValidationError } from "class-validator";

type Ctor = new (...args: any[]) => object;

export class ValidationFailedError extends Error {
  constructor(
    public readonly errors: { field: string; constraints: string[] }[],
  ) {
    super("Validation failed");
    this.name = "ValidationFailedError";
  }
}

export async function validationPipe(
  value: unknown,
  metatype: Ctor,
): Promise<object> {
  const instance = plainToInstance(metatype, value);

  const errors = await validate(instance);

  if (errors.length > 0) {
    const formattedErrors = errors.map((error: ValidationError) => ({
      field: error.property,
      constraints: Object.values(error.constraints ?? {}),
    }));

    throw new ValidationFailedError(formattedErrors);
  }

  return instance;
}
