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

// Crea la cuenta real en Supabase Auth (invitación por correo), su fila en `users`,
// y su primer rol en `user_roles`. Es la única función de todo el proyecto que usa
// el cliente admin — y solo después de `assertIsAdmin`.
export async function createUserWithRole(input: CreateUserInput) {
  const parsed = createUserSchema.parse(input);
  await assertIsAdmin(parsed.establishment_id);

  const admin = createAdminSupabaseClient();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.email);
  if (inviteError) throw new Error(inviteError.message);

  const authUserId = invited.user.id;

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
    .insert({ user_id: authUserId, role_id: role.id, establishment_id: parsed.establishment_id });
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
