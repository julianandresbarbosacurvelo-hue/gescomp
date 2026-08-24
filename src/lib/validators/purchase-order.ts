import { z } from 'zod';

const sourceSchema = z.object({
  requisition_item_id: z.string().uuid(),
  quantity_allocated: z.number().positive(),
});

const orderItemSchema = z.object({
  product_id: z.string().uuid().optional(),
  service_description: z.string().max(200).optional(),
  quantity: z.number().positive(),
  unit_id: z.string().uuid(),
  agreed_unit_price: z.number().nonnegative().optional(),
  sources: z.array(sourceSchema).default([]),
}).refine((item) => item.product_id || item.service_description, {
  message: 'Cada ítem necesita un producto o una descripción de servicio',
});

export const purchaseOrderSchema = z.object({
  establishment_id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  type: z.enum(['producto', 'servicio']),
  expected_delivery_date: z.string().date().optional(),
  delivery_place: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  items: z.array(orderItemSchema).min(1, 'La orden debe tener al menos un ítem'),
});

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
