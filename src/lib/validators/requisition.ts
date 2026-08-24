import { z } from 'zod';

const baseItem = z.object({
  quantity: z.number().positive('La cantidad debe ser mayor a 0'),
  unit_id: z.string().uuid(),
  priority: z.enum(['normal', 'alta', 'urgente']).optional(),
  notes: z.string().max(300).optional(),
});

const registeredItem = baseItem.extend({
  product_id: z.string().uuid(),
  unregistered_product_name: z.undefined(),
});

const unregisteredItem = baseItem.extend({
  product_id: z.undefined(),
  unregistered_product_name: z.string().min(2, 'Describe el producto').max(150),
});

export const requisitionItemSchema = z.union([registeredItem, unregisteredItem]);

export const requisitionSchema = z.object({
  establishment_id: z.string().uuid(),
  area_id: z.string().uuid(),
  required_date: z.string().date().optional(), // ISO yyyy-mm-dd
  notes: z.string().max(500).optional(),
  items: z.array(requisitionItemSchema).min(1, 'Agrega al menos un producto'),
});

export type RequisitionInput = z.infer<typeof requisitionSchema>;
