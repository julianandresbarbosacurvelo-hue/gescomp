'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requisitionSchema, type RequisitionInput } from '@/lib/validators/requisition';
import { revalidatePath } from 'next/cache';

// Pantalla "Nuevo Requerimiento" — una sola llamada transaccional vía RPC,
// así nunca queda un requerimiento a medio guardar si falla un ítem.
//
// Devuelve { data } | { error } en vez de lanzar con `throw` — igual que
// categories.ts (ver comentario ahí): Next.js redacta en producción el
// mensaje de cualquier error lanzado desde un Server Action, y esta pantalla
// es exactamente donde eso mordió: un usuario reportó un envío fallido con el
// mensaje genérico "Server Components render error", que no decía nada sobre
// la causa real (podía ser RLS, red, validación de Zod, lo que sea). Al venir
// como dato, el mensaje real llega intacto y el cliente lo relanza como Error
// de JS normal para que react-query lo capture en onError.
export async function createRequisition(input: RequisitionInput) {
  const parsed = requisitionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del requerimiento.' };
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('create_requisition_with_items', {
    p_establishment_id: parsed.data.establishment_id,
    p_area_id: parsed.data.area_id,
    p_required_date: parsed.data.required_date ?? null,
    p_notes: parsed.data.notes ?? null,
    p_items: parsed.data.items,
  });
  // Si el usuario no tiene rol de esa área en ese establecimiento, RLS rechaza el insert
  // dentro de la función y esto llega como error — no como un requerimiento vacío.
  if (error) return { error: error.message };
  revalidatePath('/requerimientos/mis-requerimientos');
  return { data: data as string }; // id del requerimiento creado
}

// Pantalla "Mis Requerimientos" — RLS ya filtra a los del usuario/área, no hace falta repetir el filtro aquí.
export async function listMyRequisitions(establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('requisitions')
    .select(`
      id, code, status, required_date, created_at, notes,
      area:areas(name),
      requisition_items(id, quantity, priority, product:products(name), unit:units(code), unregistered_product_name)
    `)
    .eq('establishment_id', establishmentId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// Pantalla "Detalle de Requerimiento" — se agregó unit:units(code) a los ítems (antes
// faltaba ese embed aquí, aunque listMyRequisitions ya lo traía) para poder mostrar
// la unidad de cada producto en el detalle, no solo la cantidad.
export async function getRequisitionDetail(id: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('requisitions')
    .select(`
      *, area:areas(name),
      requisition_items(*, product:products(name), unit:units(code)),
      requester:users!requisitions_requested_by_fkey(full_name)
    `)
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Pantalla "Requerimientos Consolidados" / "Bandeja de Compras" — usa la vista
// v_consolidated_requisition_items definida en la migración 0004.
export async function getConsolidatedRequisitionItems(establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('v_consolidated_requisition_items')
    .select(`
      product_id, unregistered_product_name, total_quantity, has_urgent, breakdown_by_area,
      product:products(name, internal_code),
      unit:units(code, name)
    `)
    .eq('establishment_id', establishmentId)
    .order('has_urgent', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}
