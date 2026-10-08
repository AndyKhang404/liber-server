import { z } from 'zod';

export const userInfoSchema = z.object({
  username: z.string().min(3).max(32),
  email: z.email(),
  passwordHash: z.string(),
});

export type UserInfoDto = z.infer<typeof userInfoSchema>;

export const userSchema = userInfoSchema.extend({
  userId: z.string(),
});

export type UserDto = z.infer<typeof userSchema>;

export const userResponseSchema = z.object({
  userId: z.string(),
  username: z.string().min(3).max(32),
  email: z.email(),
});

export type UserResponseDto = z.infer<typeof userResponseSchema>;
