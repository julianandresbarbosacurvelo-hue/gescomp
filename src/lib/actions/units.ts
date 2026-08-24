'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { unitSchema, type UnitInput } from '@/lib/validators/unit';
import { revalidatePath } from 'next/cache';

// Sin soft delete: `units` no tiene `is_active` (es un catálogo pequeño y estable,
// no se previó desactivación — si hace falta más adelante, se agrega la columna).
export async function listUnits() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('units').select('*').order('name');
  if (error) throw new Error(error.message);
  return data;
}

export async function createUnit(input: UnitInput) {
  const parsed = unitSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('units').insert(parsed).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/productos');
  return data;
}

export async function updateUnit(id: string, input: Partial<UnitInput>) {
  const parsed = unitSchema.partial().parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('units').update(parsed).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/productos');
  return data;
}
