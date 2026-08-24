import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente que corre en el servidor, respetando la sesión del usuario (y por tanto RLS).
// Usar SIEMPRE este cliente en Server Actions — nunca el service role, salvo tareas
// administrativas explícitas (ej. triggers de auditoría) que se aíslan aparte.
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // se puede ignorar si se llama desde un Server Component (no puede escribir cookies)
          }
        },
      },
    }
  );
}
