'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { categorySchema, type CategoryInput } from '@/lib/validators/category';
import { revalidatePath } from 'next/cache';

// Next.js (App Router) redacta en producción el mensaje de cualquier error que un
// Server Action lance con `throw` — el cliente solo recibe un mensaje genérico
// ("Server Components render...") sin importar qué tan claro sea el texto original.
// Por eso createCategory/updateCategory NO lanzan el error: lo devuelven como dato
// ({ error: '...' }), que sí cruza intacto al cliente, donde se relanza como un Error
// normal de JS para que react-query lo capture y muestre el toast correspondiente.
function friendlyCategoryError(error: { code?: string; message: string }) {
  if (error.code === '23505') return 'Ya existe una categoría con ese nombre.';
  return 'No pudimos guardar la categoría. Intenta de nuevo.';
}

export async function listCategories() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
  .from('categories')
  .select('*')
  .order('display_order', { ascending: true, nullsFirst: false });

console.log('[listCategories] error:', error?.message ?? 'ninguno');
  console.log('[listCategories] data.length:', data?.length ?? 'null/undefined');

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
// Ese error (y el de nombre duplicado) se devuelve como dato, nunca con `throw`
// (ver friendlyCategoryError arriba).
if (error) return { error: friendlyCategoryError(error) };

revalidatePath('/productos');
  return { data };
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

if (error) return { error: friendlyCategoryError(error) };

revalidatePath('/productos');
  return { data };
}

// Soft delete — nunca DELETE físico en catálogos ya usados por productos/transacciones.
export async function deactivateCategory(id: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('categories').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/productos');
}
