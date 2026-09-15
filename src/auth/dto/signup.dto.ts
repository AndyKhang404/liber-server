import { z } from 'zod';

export const signUpSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.email(),
  password: z.string().min(6).max(128),
});

export type SignUpDto = z.infer<typeof signUpSchema>;
