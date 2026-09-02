'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { purchaseOrderSchema, type PurchaseOrderInput } from '@/lib/validators/purchase-order';
import { generatePurchaseOrderPdf } from '@/lib/pdf/purchase-order-pdf';
import { revalidatePath } from 'next/cache';

const SIN_PROVEEDOR = '00000000-0000-0000-0000-000000000000';

// Pantalla "Pedidos por Proveedor" — agrupa la consolidación de la Fase 9 por proveedor habitual.
// NOTA TÉCNICA: no se puede "embeber" relaciones (product:products(...)) directamente sobre
// una vista — PostgREST solo resuelve embeds automáticos usando llaves foráneas reales, y las
// vistas no tienen. Por eso se trae la vista en crudo y se completan los nombres aparte.
export async function getPedidosPorProveedor(establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('v_pedidos_por_proveedor')
    .select('supplier_id, product_id, unregistered_product_name, unit_id, total_quantity, has_urgent, breakdown_by_area')
    .eq('establishment_id', establishmentId);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { bySupplier: {}, withoutSupplier: [] };

    const productIds = Array.from(new Set(data.map((d) => d.product_id).filter(Boolean)));
    const supplierIds = Array.from(new Set(data.map((d) => d.supplier_id).filter((id) => id !== SIN_PROVEEDOR)));
    const unitIds = Array.from(new Set(data.map((d) => d.unit_id).filter(Boolean)));

  const [{ data: products }, { data: suppliers }, { data: units }, { data: priceRows }] = await Promise.all([
    productIds.length ? supabase.from('products').select('id, name, internal_code').in('id', productIds) : Promise.resolve({ data: [] as any[] }),
    supplierIds.length ? supabase.from('suppliers').select('id, trade_name, legal_name').in('id', supplierIds) : Promise.resolve({ data: [] as any[] }),
    unitIds.length ? supabase.from('units').select('id, code').in('id', unitIds) : Promise.resolve({ data: [] as any[] }),
    // Último precio confirmado por producto (cualquier proveedor), para prellenar el
    // "Precio unit." al generar la orden en vez de dejarlo en blanco cada vez — mismo
    // criterio que getProductPriceSummary usa en Recepción (lastPrice).
    productIds.length
      ? supabase
          .from('price_history')
          .select('product_id, unit_price, recorded_at')
          .eq('establishment_id', establishmentId)
          .in('product_id', productIds)
          .order('recorded_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const productMap = new Map((products ?? []).map((p) => [p.id, p]));
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s]));
  const unitMap = new Map((units ?? []).map((u) => [u.id, u]));

  // price_history viene ordenado por recorded_at desc — el primer registro que se
  // encuentre por product_id ya es el más reciente.
  const lastPriceMap = new Map<string, number>();
  for (const row of priceRows ?? []) {
    if (!lastPriceMap.has(row.product_id)) lastPriceMap.set(row.product_id, Number(row.unit_price));
  }

  const enriched = data.map((d) => ({
    ...d,
    product: d.product_id ? productMap.get(d.product_id) ?? null : null,
    supplier: supplierMap.get(d.supplier_id) ?? null,
    unit: unitMap.get(d.unit_id) ?? null,
    last_known_price: d.product_id ? lastPriceMap.get(d.product_id) ?? null : null,
  }));

  const withoutSupplier = enriched.filter((d) => d.supplier_id === SIN_PROVEEDOR);

  // FIX: Object.groupBy() devuelve un objeto con prototipo nulo (Object.create(null)),
  // y Next.js rechaza pasar ese tipo de objeto de un Server Component/Action a un
  // Client Component ("Only plain objects... null prototypes are not supported").
  // Object.fromEntries(Object.entries(...)) reconstruye el mismo contenido como un
  // objeto plano normal, serializable.
  const bySupplier = Object.fromEntries(
    Object.entries(
      Object.groupBy(
        enriched.filter((d) => d.supplier_id !== SIN_PROVEEDOR),
        (d) => d.supplier_id
      )
    )
  ) as Record<string, typeof enriched>;

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

// Envuelve generateAndAttachOrderPdf con el patrón {data}|{error} para poder llamarla
// manualmente desde "Detalle de Orden" (botón "Generar PDF") cuando la generación
// automática al crear la orden falló silenciosamente — antes ese fallo solo quedaba en
// console.error del servidor y no había ninguna forma de reintentarlo ni de ver el motivo.
export async function regeneratePurchaseOrderPdf(orderId: string) {
  try {
    const fileUrl = await generateAndAttachOrderPdf(orderId);
    return { data: fileUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error desconocido al generar el PDF.' };
  }
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
          requisition_item:requisition_items(id, quantity, requisition:requisitions(code, area:areas(name)))),
        delivery_items(quantity_received, is_conforming, difference_reason, invoiced_unit_price))
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

// Botón "Cerrar orden" en Detalle de Orden — solo se habilita cuando status='conciliada'
// (validado también del lado del cliente en page.tsx). El backend valida de nuevo con
// GET DIAGNOSTICS: si el UPDATE afecta 0 filas (por RLS o estado inválido), lanza un
// error explícito en vez de fallar en silencio.
export async function closePurchaseOrder(purchaseOrderId: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc('close_purchase_order', {
    p_purchase_order_id: purchaseOrderId,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/compras/ordenes');
  revalidatePath(`/compras/ordenes/${purchaseOrderId}`);
}

// Botón "Cancelar orden" en Detalle de Orden — el backend ya bloquea cancelar órdenes
// recibidas totalmente, conciliadas o cerradas, y libera de vuelta las requisiciones
// asociadas (status 'en_orden' -> 'enviado') para que puedan volver a consolidarse.
export async function cancelPurchaseOrder(purchaseOrderId: string, reason: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc('cancel_purchase_order', {
    p_purchase_order_id: purchaseOrderId,
    p_reason: reason,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/compras/ordenes');
  revalidatePath(`/compras/ordenes/${purchaseOrderId}`);
  revalidatePath('/compras/bandeja');
}
