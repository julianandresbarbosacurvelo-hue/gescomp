'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { deliverySchema, type DeliveryInput } from '@/lib/validators/delivery';
import { revalidatePath } from 'next/cache';

// Pantalla "Recepción Móvil" — al elegir la orden, muestra ordenado/recibido previo/pendiente
// por ítem, tal como se definió en la Fase 1 (sección 17 de tu documento original).
export async function getExpectedForOrder(purchaseOrderId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select(`
      id, quantity, product_id, agreed_unit_price, unit:units(code),
      product:products(name),
      service_description,
      delivery_items(quantity_received)
    `)
    .eq('purchase_order_id', purchaseOrderId);

  if (error) throw new Error(error.message);

    return data.map((item: any) => {
        const receivedSoFar = item.delivery_items.reduce((sum: number, d: any) => sum + Number(d.quantity_received), 0);
    return {
      purchase_order_item_id: item.id,
      product_id: item.product_id,
      name: item.product?.name ?? item.service_description ?? 'Ítem',
      unit_code: item.unit?.code,
      ordered: item.quantity,
      received_previously: receivedSoFar,
      pending: Math.max(0, Number(item.quantity) - receivedSoFar),
      // Precio acordado en la orden — se usa para sugerir el precio de factura al recibir,
      // en vez de dejarlo en blanco (ver ReceivingItem: solo aplica si el receptor abre
      // "Registrar precio", nunca se envía sin que él lo confirme).
      agreed_unit_price: item.agreed_unit_price ?? null,
    };
  });
}

export async function createDelivery(input: DeliveryInput) {
  const parsed = deliverySchema.parse(input);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc('create_delivery_with_items', {
    p_purchase_order_id: parsed.purchase_order_id,
    p_establishment_id: parsed.establishment_id,
    p_notes: parsed.notes ?? null,
    p_items: parsed.items,
  });

  // RLS (Fase 7) exige un rol activo en el establecimiento — "cualquiera puede recibir",
  // tal como confirmaste, sin necesitar coordinador ni un rol de "receptor" dedicado.
  if (error) throw new Error(error.message);

  revalidatePath('/recepcion');
  revalidatePath('/compras/ordenes');
  return data as string; // id de la recepción creada
}

// La foto se sube DESPUÉS de crear la recepción (no antes): la política RLS de
// `attachments` para entity_type='delivery' exige que `deliveries.received_by = auth.uid()`
// sobre un delivery_id real, que solo existe una vez confirmada la recepción.
export async function uploadDeliveryPhoto(deliveryId: string, deliveryItemId: string, file: File) {
  const supabase = await createServerSupabaseClient();
  const path = `${deliveryId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('evidencias-recepcion')
    .upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrl } = supabase.storage.from('evidencias-recepcion').getPublicUrl(path);

  const { data: attachment, error } = await supabase
    .from('attachments')
    .insert({ entity_type: 'delivery', entity_id: deliveryId, file_url: publicUrl.publicUrl, file_type: file.type })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { error: linkError } = await supabase
    .from('delivery_items')
    .update({ photo_attachment_id: attachment.id })
    .eq('id', deliveryItemId);
  if (linkError) throw new Error(linkError.message);

  revalidatePath('/recepcion');
  return attachment.id as string;
}

// Tras crear la recepción (createDelivery solo devuelve el id), se necesita saber qué
// delivery_item corresponde a cada purchase_order_item para poder subir la foto de
// evidencia con el id correcto (ver nota en uploadDeliveryPhoto).
export async function getDeliveryItemIds(deliveryId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('delivery_items')
    .select('id, purchase_order_item_id')
    .eq('delivery_id', deliveryId);
  if (error) throw new Error(error.message);
  return data;
}
