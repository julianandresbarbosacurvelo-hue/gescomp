'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function listEstablishments() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('establishments').select('*').order('name');
  if (error) throw new Error(error.message);
  return data;
}

// El código corto se usa en los consecutivos de requerimientos/órdenes (REQ-RCS-2026-0001) —
// ver next_code() en el backend (Fase 9, actualizado en la migración 0030 con vigencia
// fiscal). Debe ser único y corto (3-4 letras sugerido).
export async function createEstablishment(input: { name: string; short_code: string; nit?: string; address?: string; city?: string }) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('establishments')
    .insert({ name: input.name, short_code: input.short_code.toUpperCase(), nit: input.nit, address: input.address, city: input.city, is_active: true })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/admin/establecimientos');
  return data;
}

// Edición de un establecimiento existente — antes solo se podía crear/desactivar, sin forma
// de corregir datos ya cargados (ej. el caso real: 2 sedes renombradas de "Bogotá"/"Medellín"
// a sus nombres definitivos, pero cuya ciudad real y prefijo de consecutivo (short_code)
// habían quedado sin actualizar — ver migración 0030). short_code se sigue usando tal cual en
// next_code(), así que cambiarlo aquí cambia el prefijo de los PRÓXIMOS códigos generados,
// sin afectar los ya emitidos.
export async function updateEstablishment(
  id: string,
  input: { name?: string; short_code?: string; nit?: string; address?: string; city?: string }
) {
  const supabase = await createServerSupabaseClient();
  const patch: Record<string, unknown> = { ...input };
  if (patch.short_code) patch.short_code = (patch.short_code as string).toUpperCase();
  const { data, error } = await supabase.from('establishments').update(patch).eq('id', id).select().single();
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
