'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { purchaseOrderSchema, type PurchaseOrderInput } from '@/lib/validators/purchase-order';
import { generatePurchaseOrderPdf } from '@/lib/pdf/purchase-order-pdf';
import { revalidatePath } from 'next/cache';

const SIN_PROVEEDOR = '00000000-0000-0000-0000-000000000000';

// Pantalla "Pedidos por Proveedor" — agrupa la consolidación de la Fase 9 por proveedor habitual.
export async function getPedidosPorProveedor(establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('v_pedidos_por_proveedor')
    .select(`
      supplier_id, product_id, unregistered_product_name, total_quantity, has_urgent, breakdown_by_area,
      product:products(name, internal_code),
      unit:units(code),
      supplier:suppliers(trade_name, legal_name)
    `)
    .eq('establishment_id', establishmentId);

  if (error) throw new Error(error.message);

  const withoutSupplier = data.filter((d) => d.supplier_id === SIN_PROVEEDOR);
  const bySupplier = Object.groupBy(
    data.filter((d) => d.supplier_id !== SIN_PROVEEDOR),
    (d) => d.supplier_id
  );

  return { bySupplier, withoutSupplier };
}

// Pantalla "Detalle de Orden" tras generarla / "Generar Orden de Compra"
export async function createPurchaseOrder(input: PurchaseOrderInput) {
  const parsed = purchaseOrderSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc('create_purchase_order_with_items', {
    p_establishment_id: parsed.establishment_id,
    p_supplier_id: parsed.supplier_id,
    p_type: parsed.type,
    p_expected_delivery_date: parsed.expected_delivery_date ?? null,
    p_delivery_place: parsed.delivery_place ?? null,
    p_notes: parsed.notes ?? null,
    p_items: parsed.items,
  });

  // RLS de purchase_orders (Fase 7) exige admin/coordinador_compras — si un rol de área
  // llega aquí por error de UI, la función falla y no se genera ninguna orden.
  if (error) throw new Error(error.message);

  revalidatePath('/compras/bandeja');
  revalidatePath('/compras/ordenes');

  const orderId = data as string;

  // Genera el PDF de inmediato y lo adjunta a la orden — así "Detalle de Orden"
  // ya trae el botón de compartir por WhatsApp/e-mail sin un paso manual aparte.
  try {
    await generateAndAttachOrderPdf(orderId);
  } catch (pdfError) {
    // La orden ya quedó creada correctamente; el PDF se puede regenerar después
    // desde el Detalle de Orden si esto falla (ej. bucket no configurado aún).
    console.error('No se pudo generar el PDF de la orden:', pdfError);
  }

  return orderId;
}

// Genera el PDF de una orden existente, lo sube a Storage y lo adjunta.
// Se puede volver a llamar manualmente desde "Detalle de Orden" (ej. si cambió algo).
export async function generateAndAttachOrderPdf(orderId: string) {
  const supabase = await createServerSupabaseClient();

  const { data: order, error: orderError } = await supabase
    .from('purchase_orders')
    .select(`
      code, created_at, expected_delivery_date, delivery_place, notes, subtotal, total, type,
      establishment:establishments(name, address, nit),
      supplier:suppliers(legal_name, trade_name, nit, contact_name, phone),
      buyer:users!purchase_orders_buyer_id_fkey(full_name),
      purchase_order_items(quantity, agreed_unit_price, line_total,
        product:products(name), unit:units(code), service_description)
    `)
    .eq('id', orderId)
    .single();

  if (orderError) throw new Error(orderError.message);

  const pdfBytes = await generatePurchaseOrderPdf({
    code: order.code,
    created_at: order.created_at,
    expected_delivery_date: order.expected_delivery_date,
    delivery_place: order.delivery_place,
    notes: order.notes,
    subtotal: order.subtotal,
    total: order.total,
    establishment: order.establishment as any,
    supplier: order.supplier as any,
    buyer: order.buyer as any,
    items: order.purchase_order_items.map((i: any) => ({
      description: i.product?.name ?? i.service_description ?? 'Ítem',
      quantity: i.quantity,
      unit_code: i.unit?.code ?? '-',
      agreed_unit_price: i.agreed_unit_price,
      line_total: i.line_total,
    })),
  });

  const filePath = `${order.code}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from('ordenes-pdf')
    .upload(filePath, pdfBytes, { contentType: 'application/pdf', upsert: true });

  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrl } = supabase.storage.from('ordenes-pdf').getPublicUrl(filePath);

  const { data: attachment, error: attachmentError } = await supabase
    .from('attachments')
    .insert({
      entity_type: 'purchase_order',
      entity_id: orderId,
      file_url: publicUrl.publicUrl,
      file_type: 'application/pdf',
    })
    .select()
    .single();

  if (attachmentError) throw new Error(attachmentError.message);

  const { error: linkError } = await supabase
    .from('purchase_orders')
    .update({ pdf_attachment_id: attachment.id })
    .eq('id', orderId);

  if (linkError) throw new Error(linkError.message);

  revalidatePath(`/compras/ordenes/${orderId}`);
  return attachment.file_url as string;
}

export async function listPurchaseOrders(establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, code, status, type, total, expected_delivery_date, created_at, supplier:suppliers(trade_name)')
    .eq('establishment_id', establishmentId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getPurchaseOrderDetail(id: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *, supplier:suppliers(*), pdf_attachment:attachments(file_url),
      purchase_order_items(*, product:products(name), unit:units(code),
        purchase_order_item_sources(quantity_allocated,
          requisition_item:requisition_items(id, quantity, requisition:requisitions(code, area:areas(name)))))
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// Timeline visual (sección 39/79 del brief) — quién hizo qué y cuándo, para el detalle de orden.
export async function getPurchaseOrderTimeline(id: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('status_history')
    .select('*, changed_by_user:users(full_name)')
    .eq('entity_type', 'purchase_order')
    .eq('entity_id', id)
    .order('changed_at');
  if (error) throw new Error(error.message);
  return data;
}
