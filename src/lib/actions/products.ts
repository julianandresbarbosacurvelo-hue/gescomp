'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { productSchema, type ProductInput } from '@/lib/validators/product';
import { revalidatePath } from 'next/cache';

// Búsqueda predictiva usada por el selector de productos en "Nuevo Requerimiento".
export async function searchProducts(query: string, limit = 15) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, internal_code, name, unit_id, category_id, units(code)')
    .ilike('name', `%${query}%`)
    .eq('is_active', true)
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}

// Navegación por categoría (flujo carrito, Etapa Frontend 6) — catálogo completo,
// no "frecuentes", tal como se pidió explícitamente.
export async function listProductsByCategory(categoryId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('products')
    .select('id, internal_code, name, unit_id, category_id, units(code)')
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(error.message);
  return data;
}

// Listado completo para la pantalla "Productos" (Etapa Frontend 11) — con filtros.
// `limit` evita traer y renderizar las ~1.000 referencias reales de una sola vez sin
// filtro: mejor forzar al buscador/categoría que virtualizar la lista (no agregué
// react-window u otra librería de virtualización sin que me lo pidas primero).
export async function listProducts(filters: { categoryId?: string; search?: string; activeOnly?: boolean; limit?: number } = {}) {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from('products')
    .select('id, internal_code, name, is_active, category:categories(name), unit:units(code)')
    .order('name')
    .limit(filters.limit ?? 100);

  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.search) query = query.ilike('name', `%${filters.search}%`);
  if (filters.activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// Historial crudo de precios para la ficha 360° (sección 49 del brief): fecha,
// proveedor, cantidad(no aplica aquí, price_history es por evento de precio), precio,
// variación vs. el registro anterior, orden relacionada.
export async function getProductPriceHistory(productId: string, establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('price_history')
    .select('id, unit_price, recorded_at, source, supplier:suppliers(trade_name, legal_name), purchase_order:purchase_orders(code)')
    .eq('product_id', productId)
    .eq('establishment_id', establishmentId)
    .order('recorded_at', { ascending: false });

  if (error) throw new Error(error.message);

  return data.map((row, i, arr) => {
    const previous = arr[i + 1]; // el siguiente en la lista es el anterior en el tiempo (orden desc)
    const variationPct = previous ? ((Number(row.unit_price) - Number(previous.unit_price)) / Number(previous.unit_price)) * 100 : null;
    return { ...row, variationPct };
  });
}

export async function createProduct(input: ProductInput) {
  const parsed = productSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('products')
    .insert(parsed)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/productos');
  return data;
}

export async function updateProduct(id: string, input: Partial<ProductInput>) {
  const parsed = productSchema.partial().parse(input);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('products')
    .update(parsed)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/productos');
  return data;
}

export async function deactivateProduct(id: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/productos');
}

// Ficha del producto: último precio vigente por establecimiento, derivado de price_history
// (nunca de un campo fijo en `products` — ver Fase 2, sección 4.6).
export async function getProductPriceSummary(productId: string, establishmentId: string) {
  const supabase = await createServerSupabaseClient();

  const { data: last, error: lastError } = await supabase
    .from('price_history')
    .select('unit_price, recorded_at, supplier_id, source')
    .eq('product_id', productId)
    .eq('establishment_id', establishmentId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) throw new Error(lastError.message);

  const { data: history, error: historyError } = await supabase
    .from('price_history')
    .select('unit_price, recorded_at')
    .eq('product_id', productId)
    .eq('establishment_id', establishmentId)
    .gte('recorded_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

  if (historyError) throw new Error(historyError.message);

  const avg90 = history?.length
    ? history.reduce((sum, r) => sum + Number(r.unit_price), 0) / history.length
    : null;

  return { lastPrice: last, average90Days: avg90 };
}
