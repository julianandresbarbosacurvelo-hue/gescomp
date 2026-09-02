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

// Por defecto solo trae categorías activas — quien necesite ver también las
// inactivas (la pantalla de administración de Categorías) pasa includeInactive:true
// explícitamente. Antes esta función siempre traía todo sin filtrar, y como el
// orden era por `display_order` (columna vieja, inconsistente: las categorías
// antiguas la tenían seteada y las nuevas quedaban en null), las categorías ya
// desactivadas terminaban apareciendo PRIMERO en el selector de categorías del
// requerimiento móvil — sin productos, generando confusión. Se ordena por nombre,
// que es estable y no depende de esa columna.
export async function listCategories(opts?: { includeInactive?: boolean }) {
  const supabase = await createServerSupabaseClient();
  let query = supabase.from('categories').select('*').order('name', { ascending: true });
  if (!opts?.includeInactive) {
    query = query.eq('is_active', true);
  }
  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return data;
}

// Cuántos productos usa cada categoría (activos e inactivos, porque igual bloquean
// el borrado físico) — usado por la pantalla de administración para decidir si una
// categoría inactiva ya se puede eliminar de verdad.
export async function getCategoryProductCounts() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('products').select('category_id');
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.category_id) counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
  }
  return counts;
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

// Borrado físico — a diferencia de deactivateCategory, este SÍ elimina la fila.
// Solo tiene sentido (y solo se permite) para una categoría ya inactiva y sin
// ningún producto asociado: si tuviera productos, borrarla dejaría el catálogo
// huérfano, por eso se verifica el conteo antes de intentar el DELETE, y además
// se deja el error de FK (23503) como red de seguridad por si algo cambió entre
// la verificación y el borrado.
export async function deleteCategory(id: string) {
  const supabase = await createServerSupabaseClient();

  const { data: category, error: fetchError } = await supabase
    .from('categories')
    .select('is_active')
    .eq('id', id)
    .single();
  if (fetchError) return { error: 'No pudimos encontrar la categoría.' };
  if (category.is_active) return { error: 'Solo se pueden eliminar categorías ya desactivadas.' };

  const { count, error: countError } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);
  if (countError) return { error: 'No pudimos verificar los productos de la categoría.' };
  if (count && count > 0) {
    return { error: `No se puede eliminar: todavía tiene ${count} producto${count === 1 ? '' : 's'} asociado${count === 1 ? '' : 's'}.` };
  }

  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') return { error: 'No se puede eliminar: todavía tiene productos asociados.' };
    return { error: 'No pudimos eliminar la categoría. Intenta de nuevo.' };
  }

  revalidatePath('/productos');
  return { data: true };
}
