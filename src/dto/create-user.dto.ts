import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
});

export class CreateUserDto {
  static schema = createUserSchema;
  name!: string;
  email!: string;
}
