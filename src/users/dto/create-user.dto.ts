import { z } from 'zod';

export const createUserSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.email(),
  password: z.string().min(6).max(128),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
