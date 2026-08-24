'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { categorySchema, type CategoryInput } from '@/lib/validators/category';
import { revalidatePath } from 'next/cache';

export async function listCategories() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('display_order', { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function createCategory(input: CategoryInput) {
  const parsed = categorySchema.parse(input); // valida en el servidor, nunca confiar en el cliente
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('categories')
    .insert(parsed)
    .select()
    .single();

  // RLS ya restringe esta operación a admin/coordinador_compras — si el usuario no
  // tiene el rol, Supabase devuelve error de política y no llega a insertar nada.
  if (error) throw new Error(error.message);

  revalidatePath('/productos');
  return data;
}

export async function updateCategory(id: string, input: Partial<CategoryInput>) {
  const parsed = categorySchema.partial().parse(input);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('categories')
    .update(parsed)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/productos');
  return data;
}

// Soft delete — nunca DELETE físico en catálogos ya usados por productos/transacciones.
export async function deactivateCategory(id: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('categories').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/productos');
}
