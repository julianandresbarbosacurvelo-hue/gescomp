'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function listEstablishments() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('establishments').select('*').order('name');
  if (error) throw new Error(error.message);
  return data;
}

// El código corto se usa en los consecutivos de requerimientos/órdenes (REQ-BOG-0001) —
// ver next_code() en el backend (Fase 9). Debe ser único y corto (3-4 letras sugerido).
export async function createEstablishment(input: { name: string; short_code: string; nit?: string; address?: string }) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('establishments')
    .insert({ name: input.name, short_code: input.short_code.toUpperCase(), nit: input.nit, address: input.address, is_active: true })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/admin/establecimientos');
  return data;
}

export async function deactivateEstablishment(id: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('establishments').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/establecimientos');
}
