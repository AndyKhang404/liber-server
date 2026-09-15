import { z } from 'zod';

export const signInSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(128),
});

export type SignInDto = z.infer<typeof signInSchema>;
