import type { ZodType } from 'zod';

type Ctor = (new (...args: any[]) => object) & { schema?: ZodType };

export class ValidationError extends Error {
  constructor(
    public readonly errors: { field: string; constraints: string[] }[],
  ) {
    super("Validation failed");
    this.name = "ValidationError";
  }
}

export function zodValidationPipe(value: unknown, metatype: Ctor): object {
  const schema = metatype.schema;
  if (!schema) return value as object;

  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        constraints: [issue.message],
      })),
    );
  }

  return Object.assign(new metatype(), result.data);
}
