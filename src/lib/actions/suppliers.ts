'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supplierSchema, type SupplierInput } from '@/lib/validators/supplier';
import { revalidatePath } from 'next/cache';

export async function listSuppliers() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('suppliers').select('*').order('trade_name', { nullsFirst: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getSupplierDetail(id: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createSupplier(input: SupplierInput) {
  const parsed = supplierSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('suppliers').insert(parsed).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/proveedores');
  return data;
}

export async function updateSupplier(id: string, input: Partial<SupplierInput>) {
  const parsed = supplierSchema.partial().parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('suppliers').update(parsed).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/proveedores');
  return data;
}

export async function deactivateSupplier(id: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('suppliers').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/proveedores');
}

// ---------- Relación producto-proveedor (de dónde sale "Pedidos por Proveedor") ----------

export async function listSuppliersForProduct(productId: string, establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('product_suppliers')
    .select('id, supplier_id, is_preferred, supplier:suppliers(trade_name, legal_name)')
    .eq('product_id', productId)
    .eq('establishment_id', establishmentId);
  if (error) throw new Error(error.message);
  return data;
}

// Marca un proveedor como habitual para un producto en un establecimiento — desmarca
// cualquier otro `is_preferred` previo para esa combinación (solo puede haber uno).
export async function setPreferredSupplier(productId: string, supplierId: string, establishmentId: string) {
  const supabase = await createServerSupabaseClient();

  const { error: clearError } = await supabase
    .from('product_suppliers')
    .update({ is_preferred: false })
    .eq('product_id', productId)
    .eq('establishment_id', establishmentId);
  if (clearError) throw new Error(clearError.message);

  const { data, error } = await supabase
    .from('product_suppliers')
    .upsert(
      { product_id: productId, supplier_id: supplierId, establishment_id: establishmentId, is_preferred: true },
      { onConflict: 'product_id,supplier_id,establishment_id' }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidatePath('/productos');
  revalidatePath('/compras/bandeja');
  return data;
}

export async function addAlternativeSupplier(productId: string, supplierId: string, establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('product_suppliers')
    .insert({ product_id: productId, supplier_id: supplierId, establishment_id: establishmentId, is_preferred: false })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/productos');
  return data;
}

// Ficha 360° del proveedor (Etapa Frontend 12) — KPIs + series + top productos.
export async function getSupplierAnalysis(supplierId: string, establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_supplier_analysis', {
    p_supplier_id: supplierId,
    p_establishment_id: establishmentId,
  });
  if (error) throw new Error(error.message);
  return data;
}
