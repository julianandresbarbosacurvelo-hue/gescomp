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

// Botón "Anular ítem" en Detalle de Requerimiento (admin/coordinador_compras) — para
// cuando un ítem puntual ya no aplica (ej. se canceló el evento para el que era, o
// cambió la reserva) sin tener que anular todo el requerimiento. RLS
// (requisition_items_buyer_update, migración 0002) ya exige admin/coordinador_compras;
// la función además valida que el requerimiento siga 'enviado' (migración 0035).
export async function cancelRequisitionItem(requisitionItemId: string, reason: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc('cancel_requisition_item', {
    p_requisition_item_id: requisitionItemId,
    p_reason: reason,
  });
  if (error) return { error: error.message };
  revalidatePath('/compras/bandeja');
  revalidatePath('/compras/pedidos-proveedor');
  return { data: true };
}

// Botón "Anular requerimiento" en Detalle de Requerimiento (admin/coordinador_compras)
// — para cuando TODO el requerimiento ya no aplica (evento cancelado, cierre temporal
// del establecimiento, etc.), no solo un ítem. Mismo patrón que cancelPurchaseOrder.
export async function cancelRequisition(requisitionId: string, reason: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc('cancel_requisition', {
    p_requisition_id: requisitionId,
    p_reason: reason,
  });
  if (error) return { error: error.message };
  revalidatePath('/compras/bandeja');
  revalidatePath('/compras/pedidos-proveedor');
  revalidatePath('/requerimientos/mis-requerimientos');
  revalidatePath(`/requerimientos/${requisitionId}`);
  return { data: true };
}

// Botones "Anular"/"Anular todo este pedido" en "Nueva orden" (Pedidos por Proveedor) —
// a diferencia de cancelRequisitionItem, acá un producto consolidado casi nunca es UN
// solo ítem: es la suma de varios requisition_item de varios requerimientos (a veces de
// varias áreas) que pidieron lo mismo (ver breakdown_by_area, migración 0033). Por eso
// se anula por lote: la función `cancel_requisition_items_batch` (migración 0036)
// reutiliza `cancel_requisition_item` para cada id, y todo corre en una sola transacción
// — si cualquier ítem de la lista no se puede anular, no se anula NADA de la lista.
export async function cancelRequisitionItemsBatch(requisitionItemIds: string[], reason: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc('cancel_requisition_items_batch', {
    p_requisition_item_ids: requisitionItemIds,
    p_reason: reason,
  });
  if (error) return { error: error.message };
  revalidatePath('/compras/bandeja');
  revalidatePath('/compras/pedidos-proveedor');
  revalidatePath('/compras/ordenes/nueva');
  revalidatePath('/requerimientos/mis-requerimientos');
  return { data: true };
}
