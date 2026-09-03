import { z } from 'zod';

// Antes exigía quantity_invoiced/unit_price_invoiced > 0 en TODOS los ítems — pero un
// ítem de la orden puede legítimamente no venir en la factura del proveedor (no llegó en
// la entrega, o llegó pero el proveedor no lo cobró). create_invoice_with_items ya soporta
// ese caso (registra el ítem en 0/0 y genera la alerta de "diferencia_factura" para dejar
// trazabilidad), pero esta validación lo rechazaba antes de que la petición llegara siquiera
// a la base de datos, y el error de Zod sin capturar se veía como una caída genérica de la
// pantalla ("Server Components render"), no como un mensaje explicable. Ver el caso real:
// factura de Novillano JP donde "Tuetano" no fue entregado ni facturado por el proveedor.
// CAMBIO: se permite 0 en ambos campos, pero solo juntos — "no facturado" es (0, 0); un
// ítem sí facturado sigue necesitando cantidad Y precio mayores a 0 (evita registrar sin
// querer un ítem con cantidad pero precio en cero, o con precio pero cantidad en cero).
const invoiceItemSchema = z
  .object({
    purchase_order_item_id: z.string().uuid(),
    quantity_invoiced: z.number().nonnegative(),
    unit_price_invoiced: z.number().nonnegative(),
  })
  .refine((item) => (item.quantity_invoiced === 0) === (item.unit_price_invoiced === 0), {
    message:
      'Si un producto no fue facturado por el proveedor, deja su cantidad y su precio en 0. Si sí fue facturado, ambos deben ser mayores a 0.',
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
