import { z } from 'zod';

export const areaSchema = z.object({
  establishment_id: z.string().uuid(),
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(60),
  is_active: z.boolean().default(true),
});
export type AreaInput = z.infer<typeof areaSchema>;
