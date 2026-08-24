'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { invoiceSchema, reconciliationSchema, type InvoiceInput, type ReconciliationInput } from '@/lib/validators/invoice';
import { revalidatePath } from 'next/cache';

export async function createInvoice(input: InvoiceInput) {
  const parsed = invoiceSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc('create_invoice_with_items', {
    p_purchase_order_id: parsed.purchase_order_id,
    p_establishment_id: parsed.establishment_id,
    p_supplier_id: parsed.supplier_id,
    p_invoice_number: parsed.invoice_number,
    p_invoice_date: parsed.invoice_date,
    p_file_attachment_id: parsed.file_attachment_id ?? null,
    p_items: parsed.items,
  });

  // RLS de invoices/invoice_items (Fase 7) exige admin/coordinador_compras.
  if (error) throw new Error(error.message);

  revalidatePath('/facturas');
  return data as string; // id de la factura creada
}

// Pantalla "Conciliación" — trae orden, recepción y factura lado a lado para el three-way match.
export async function getThreeWayMatchSummary(purchaseOrderId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('purchase_order_items')
    .select(`
      id, quantity, agreed_unit_price,
      product:products(name),
      unit:units(code),
      delivery_items(quantity_received),
      invoice_items(quantity_invoiced, unit_price_invoiced)
    `)
    .eq('purchase_order_id', purchaseOrderId);

  if (error) throw new Error(error.message);

  return data.map((item) => {
    const received = item.delivery_items.reduce((s, d) => s + Number(d.quantity_received), 0);
    const invoiced = item.invoice_items.reduce((s, i) => s + Number(i.quantity_invoiced), 0);
    return {
      name: item.product?.name,
      unit_code: item.unit?.code,
      ordered: item.quantity,
      received,
      invoiced,
      matches: item.quantity === received && received === invoiced,
    };
  });
}

export async function reconcileInvoice(input: ReconciliationInput) {
  const parsed = reconciliationSchema.parse(input);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc('reconcile_invoice', {
    p_invoice_id: parsed.invoice_id,
    p_final_amount_to_pay: parsed.final_amount_to_pay,
    p_price_adjustments: parsed.price_adjustments,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/conciliacion');
  revalidatePath('/facturas');
}

export async function closePurchaseOrder(purchaseOrderId: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc('close_purchase_order', { p_purchase_order_id: purchaseOrderId });
  if (error) throw new Error(error.message);
  revalidatePath('/compras/ordenes');
}

// Detectado en QA (Fase 17): faltaba la acción de cancelar una orden.
export async function cancelPurchaseOrder(purchaseOrderId: string, reason: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc('cancel_purchase_order', {
    p_purchase_order_id: purchaseOrderId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/compras/ordenes');
  revalidatePath('/compras/bandeja');
}

// ---------- Listado, detalle y adjunto de factura (Etapa Frontend 10) ----------

export async function listInvoices(establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total, final_amount_to_pay, reconciled_at, supplier:suppliers(trade_name, legal_name), purchase_order:purchase_orders(code)')
    .eq('establishment_id', establishmentId)
    .order('invoice_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getInvoiceDetail(id: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *, supplier:suppliers(*), file_attachment:attachments(file_url),
      purchase_order:purchase_orders(id, code, status, total),
      invoice_items(*, purchase_order_item:purchase_order_items(product_id, unit_id, product:products(name), unit:units(code)))
    `)
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// El documento se sube DESPUÉS de crear la factura (mismo patrón que la foto de
// recepción): recién ahí existe un invoice.id real al que enlazar el adjunto.
export async function uploadInvoiceFile(invoiceId: string, file: File) {
  const supabase = await createServerSupabaseClient();
  const path = `${invoiceId}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from('facturas').upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrl } = supabase.storage.from('facturas').getPublicUrl(path);

  const { data: attachment, error } = await supabase
    .from('attachments')
    .insert({ entity_type: 'invoice', entity_id: invoiceId, file_url: publicUrl.publicUrl, file_type: file.type })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { error: linkError } = await supabase.from('invoices').update({ file_attachment_id: attachment.id }).eq('id', invoiceId);
  if (linkError) throw new Error(linkError.message);

  revalidatePath('/facturas');
  return attachment.id as string;
}
