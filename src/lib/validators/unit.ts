import { z } from 'zod';

export const unitSchema = z.object({
  code: z.string().min(1).max(15),
  name: z.string().min(2).max(60),
});
export type UnitInput = z.infer<typeof unitSchema>;
