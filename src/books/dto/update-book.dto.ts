import { z } from 'zod';

export const updateBookSchema = z.object({
  title: z.string().min(1).max(256).optional(),
  author: z.string().max(256).nullable().optional(),
  publisher: z.string().max(256).nullable().optional(),
  description: z.string().nullable().optional(),
  published_at: z.iso.date().nullable().optional(),
});

export type UpdateBookDto = z.infer<typeof updateBookSchema>;
