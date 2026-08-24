import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { SessionContext, SessionRole } from '@/lib/session-utils';

export type { SessionContext, SessionRole };

// Se llama desde Server Components (ej. el layout del app shell) — NO es una Server Action
// porque solo lee, no muta nada a pedido del usuario.
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createServerSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  const { data: userRow } = await supabase
    .from('users')
    .select('full_name, email')
    .eq('id', authData.user.id)
    .single();

  const { data: rolesData } = await supabase
    .from('user_roles')
    .select('role:roles(code), establishment:establishments(id, name)')
    .eq('user_id', authData.user.id);

  const roles: SessionRole[] = (rolesData ?? []).map((r: any) => ({
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
