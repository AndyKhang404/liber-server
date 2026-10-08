import { z } from 'zod';

export const updateUserSchema = z.object({
  username: z.string().min(3).max(32).optional(),
  email: z.email().optional(),
  password: z.string().min(6).max(128).optional(),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
