'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createUserSchema, assignRoleSchema, type CreateUserInput, type AssignRoleInput } from '@/lib/validators/user';
import { revalidatePath } from 'next/cache';

// Verifica explícitamente que quien llama es admin en ese establecimiento — usando el
// cliente NORMAL (respeta RLS). No confiar en que "solo el admin ve el botón en la UI":
// esta comprobación es la que de verdad protege la operación, porque lo que sigue
// después usa el cliente con privilegios elevados.
async function assertIsAdmin(establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('No autenticado');

  const { data, error } = await supabase
    .from('user_roles')
    .select('id, roles!inner(code)')
    .eq('user_id', userData.user.id)
    .eq('establishment_id', establishmentId)
    .eq('roles.code', 'admin')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Solo un administrador de este establecimiento puede realizar esta acción');
}

export async function listUsers(establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  // RLS (users_admin_select / user_roles) ya limita esto a lo que el rol del que llama permite ver.
  const { data, error } = await supabase
    .from('user_roles')
    .select('id, user:users(id, full_name, email, is_active), role:roles(code, name)')
    .eq('establishment_id', establishmentId);
  if (error) throw new Error(error.message);
  return data;
}

// Crea la cuenta real en Supabase Auth CON LA CONTRASEÑA que definió el
// administrador (ya no se envía invitación por correo — la persona puede
// iniciar sesión de inmediato con el correo y la contraseña que se le
// comuniquen). Su fila en `users` y su rol en `user_roles` (uno por cada
// sucursal elegida) se crean en el mismo paso. Es la única función de todo
// el proyecto que usa el cliente admin — y solo después de `assertIsAdmin`.
export async function createUserWithRole(input: CreateUserInput) {
  const parsed = createUserSchema.parse(input);

  // Debe ser admin en CADA sucursal seleccionada — verificamos todas antes
  // de crear nada, para no dejar una cuenta a medias si falla la última.
  for (const establishmentId of parsed.establishment_ids) {
    await assertIsAdmin(establishmentId);
  }

  const admin = createAdminSupabaseClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true, // sin esto, Supabase pediría confirmar por correo antes de poder iniciar sesión
  });
  if (createError) throw new Error(createError.message);

  const authUserId = created.user.id;

  const { error: userRowError } = await admin
    .from('users')
    .insert({ id: authUserId, full_name: parsed.full_name, email: parsed.email });
  if (userRowError) throw new Error(userRowError.message);

  // Para el insert en user_roles ya no hace falta el cliente admin — el llamador
  // verificado como admin puede hacerlo con su propia sesión (RLS lo permite).
  const supabase = await createServerSupabaseClient();
  const { data: role, error: roleError } = await supabase
    .from('roles').select('id').eq('code', parsed.role_code).single();
  if (roleError) throw new Error(roleError.message);

  const { error: assignError } = await supabase
    .from('user_roles')
    .insert(parsed.establishment_ids.map((establishmentId) => ({
      user_id: authUserId, role_id: role.id, establishment_id: establishmentId,
    })));
  if (assignError) throw new Error(assignError.message);

  revalidatePath('/admin/usuarios');
  return authUserId;
}

export async function assignRole(input: AssignRoleInput) {
  const parsed = assignRoleSchema.parse(input);
  await assertIsAdmin(parsed.establishment_id);

  const supabase = await createServerSupabaseClient();
  const { data: role, error: roleError } = await supabase
    .from('roles').select('id').eq('code', parsed.role_code).single();
  if (roleError) throw new Error(roleError.message);

  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: parsed.user_id, role_id: role.id, establishment_id: parsed.establishment_id });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/usuarios');
}

export async function removeRole(userRoleId: string, establishmentId: string) {
  await assertIsAdmin(establishmentId);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('user_roles').delete().eq('id', userRoleId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/usuarios');
}

export async function deactivateUser(userId: string, establishmentId: string) {
  await assertIsAdmin(establishmentId);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('users').update({ is_active: false }).eq('id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/usuarios');
}

// NUEVO — reactiva a alguien desactivado por error, o que vuelve a trabajar.
// Deliberadamente NO existe una eliminación permanente de usuarios: `users.id` es
// llave foránea en requisitions, purchase_orders, deliveries, status_history,
// audit_logs, etc. — borrar la cuenta rompería ese historial de negocio o exigiría
// un CASCADE que lo borraría también. Desactivar/reactivar es el ciclo de vida
// soportado, igual que ya existe para products/suppliers.
export async function reactivateUser(userId: string, establishmentId: string) {
  await assertIsAdmin(establishmentId);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('users').update({ is_active: true }).eq('id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/usuarios');
}

// NUEVO — edita nombre Y correo de un usuario. El correo se actualiza en DOS
// lugares: la fila de `users` (para que se vea reflejado en la app) y en
// Supabase Auth vía el cliente admin (para que la persona pueda iniciar sesión
// con el correo nuevo). Se usa `email_confirm: true` para forzar el cambio sin
// pedirle a la persona que confirme desde su bandeja de entrada — es una
// decisión deliberada pensando en el contexto real (un admin corrigiendo un
// error de tipeo al invitar a alguien, no un cambio que la persona pidió por su
// cuenta). Si prefieres el flujo más conservador (enviar confirmación al correo
// nuevo antes de aplicar el cambio), avísame y lo ajustamos.
export async function updateUserProfile(
  userId: string,
  input: { fullName: string; email: string },
  establishmentId: string
) {
  await assertIsAdmin(establishmentId);
  const trimmedName = input.fullName.trim();
  const trimmedEmail = input.email.trim();
  if (!trimmedName) throw new Error('El nombre no puede estar vacío');
  if (!trimmedEmail || !trimmedEmail.includes('@')) throw new Error('El correo no es válido');

  const admin = createAdminSupabaseClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email: trimmedEmail,
    email_confirm: true,
  });
  if (authError) throw new Error(authError.message);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('users')
    .update({ full_name: trimmedName, email: trimmedEmail })
    .eq('id', userId);
  if (error) throw new Error(error.message);

  revalidatePath('/admin/usuarios');
}

// NUEVO — busca un usuario existente por correo, para poder asignarle un rol en
// OTRO establecimiento donde todavía no tiene ninguno (ej. Fabian ya tenía rol en
// Bogotá, se le agregó Medellín más tarde — hoy eso requería SQL directo).
export async function searchUserByEmail(email: string, establishmentId: string) {
  await assertIsAdmin(establishmentId);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, is_active')
    .ilike('email', email.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// NUEVO — dispara el correo estándar de "restablecer contraseña" de Supabase Auth.
// No requiere el cliente admin: es el mismo flujo que usaría la persona por su
// cuenta en una pantalla de "olvidé mi contraseña", solo que el admin lo inicia
// en su nombre. IMPORTANTE: requiere que exista una página en el sitio que reciba
// el link de recuperación (ej. /restablecer-contrasena) — si esa página no existe
// todavía, el correo se envía pero el link no llevará a ningún lado funcional.
export async function sendPasswordResetEmail(email: string, establishmentId: string) {
  await assertIsAdmin(establishmentId);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/restablecer-contrasena`,
  });
  if (error) throw new Error(error.message);
}

// NUEVO — fija una contraseña temporal directamente, sin depender del correo.
// Útil para personal que no revisa email con frecuencia: el admin genera una
// contraseña temporal y se la comunica de viva voz o por WhatsApp, y la persona
// debería cambiarla luego desde su perfil (esa pantalla de "cambiar mi contraseña"
// es un tema aparte, no cubierto aquí). Usa el cliente admin porque fijar la
// contraseña de otra cuenta directamente es una operación privilegiada real.
export async function setTemporaryPassword(userId: string, establishmentId: string, newPassword: string) {
  await assertIsAdmin(establishmentId);
  if (newPassword.length < 8) throw new Error('La contraseña temporal debe tener al menos 8 caracteres');

  const admin = createAdminSupabaseClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) throw new Error(error.message);
}
