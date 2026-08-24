import { z } from 'zod';

const invoiceItemSchema = z.object({
  purchase_order_item_id: z.string().uuid(),
  quantity_invoiced: z.number().positive(),
  unit_price_invoiced: z.number().positive(),
});

export const invoiceSchema = z.object({
  purchase_order_id: z.string().uuid(),
  establishment_id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  invoice_number: z.string().min(1).max(50),
  invoice_date: z.string().date(),
  file_attachment_id: z.string().uuid().optional(),
  items: z.array(invoiceItemSchema).min(1),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

const priceAdjustmentSchema = z.object({
  product_id: z.string().uuid(),
  unit_price: z.number().positive(),
  unit_id: z.string().uuid(),
});

export const reconciliationSchema = z.object({
  invoice_id: z.string().uuid(),
  final_amount_to_pay: z.number().nonnegative(),
  price_adjustments: z.array(priceAdjustmentSchema).default([]),
});
export type ReconciliationInput = z.infer<typeof reconciliationSchema>;
