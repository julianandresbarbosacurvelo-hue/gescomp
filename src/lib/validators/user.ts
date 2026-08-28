import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(150),
  // El administrador la define directamente al crear la cuenta — ya no se
  // envía invitación por correo, así que no hay otro momento en que la
  // persona la establezca por su cuenta antes de poder iniciar sesión.
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  role_code: z.enum(['admin', 'coordinador_compras', 'cocina', 'bar', 'servicio']),
  // Una o varias sucursales — se asigna el mismo rol en cada una al crear la
  // cuenta (ej. un coordinador que arranca atendiendo Bogotá y Medellín).
  establishment_ids: z.array(z.string().uuid()).min(1, 'Elige al menos una sucursal'),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const assignRoleSchema = z.object({
  user_id: z.string().uuid(),
  role_code: z.enum(['admin', 'coordinador_compras', 'cocina', 'bar', 'servicio']),
  establishment_id: z.string().uuid(),
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
