import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { SessionContext, SessionRole } from '@/lib/session-utils';

export type { SessionContext, SessionRole };

// Se llama desde Server Components (ej. el layout del app shell) — NO es una Server Action
// porque solo lee, no muta nada a pedido del usuario.
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  console.log('[getSessionContext] authError:', authError?.message ?? 'ninguno');
  console.log('[getSessionContext] authData.user existe:', !!authData.user, authData.user?.id);

  if (!authData.user) return null;

  const { data: userRow, error: userRowError } = await supabase
    .from('users')
    .select('full_name, email')
    .eq('id', authData.user.id)
    .single();

  console.log('[getSessionContext] userRowError:', userRowError?.message ?? 'ninguno');
  console.log('[getSessionContext] userRow:', userRow);

  const { data: rolesData, error: rolesError } = await supabase
    .from('user_roles')
    .select('role:roles(code), establishment:establishments(id, name)')
    .eq('user_id', authData.user.id);

  console.log('[getSessionContext] rolesError:', rolesError?.message ?? 'ninguno');
  console.log('[getSessionContext] rolesData:', JSON.stringify(rolesData));

  if (rolesError) {
    console.error('[getSessionContext] Error cargando user_roles:', rolesError);
  }

  const roles: SessionRole[] = (rolesData ?? [])
    .filter((r: any) => r.role && r.establishment) // ignora filas con relación rota (role_id/establishment_id inválido)
    .map((r: any) => ({
      roleCode: r.role.code,
      establishmentId: r.establishment.id,
      establishmentName: r.establishment.name,
    }));

  return {
    userId: authData.user.id,
    fullName: userRow?.full_name ?? authData.user.email ?? 'Usuario',
    email: userRow?.email ?? authData.user.email ?? '',
    roles,
  };
}
