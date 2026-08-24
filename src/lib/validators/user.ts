import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(150),
  role_code: z.enum(['admin', 'coordinador_compras', 'cocina', 'bar', 'servicio']),
  establishment_id: z.string().uuid(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const assignRoleSchema = z.object({
  user_id: z.string().uuid(),
  role_code: z.enum(['admin', 'coordinador_compras', 'cocina', 'bar', 'servicio']),
  establishment_id: z.string().uuid(),
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
