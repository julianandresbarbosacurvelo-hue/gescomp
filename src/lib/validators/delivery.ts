import { z } from 'zod';

const deliveryItemSchema = z.object({
  purchase_order_item_id: z.string().uuid(),
  quantity_received: z.number().nonnegative(),
  difference_reason: z.string().max(200).optional(),
  invoiced_unit_price: z.number().positive().optional(), // opcional, tal como se definió en Fase 2/3
  photo_attachment_id: z.string().uuid().optional(),
});

export const deliverySchema = z.object({
  purchase_order_id: z.string().uuid(),
  establishment_id: z.string().uuid(),
  notes: z.string().max(500).optional(),
  items: z.array(deliveryItemSchema).min(1),
});

export type DeliveryInput = z.infer<typeof deliverySchema>;
