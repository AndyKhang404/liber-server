import { z } from 'zod';

export const createBookSchema = z.object({
  title: z.string().min(1).max(256),
  author: z.string().max(256).optional(),
  publisher: z.string().max(256).optional(),
  description: z.string().optional(),
  published_at: z.string().date().optional(),
});

export type CreateBookDto = z.infer<typeof createBookSchema>;
