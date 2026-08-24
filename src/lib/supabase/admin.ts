import { createClient } from '@supabase/supabase-js';

// ⚠️ Este cliente usa SUPABASE_SERVICE_ROLE_KEY y BYPASSEA todo RLS.
// Úsalo SOLO dentro de Server Actions, y SOLO después de verificar manualmente
// que quien llama tiene permiso (ver createUserWithRole: primero se valida con
// el cliente normal —respetando RLS—, y solo entonces se usa este cliente para
// la operación que Supabase Auth exige hacer con privilegios elevados
// (crear una cuenta de otra persona no es algo que el propio usuario pueda hacer
// con su sesión normal).
// NUNCA importar este archivo en un componente de cliente ni exponerlo al navegador.
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
