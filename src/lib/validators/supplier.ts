import { z } from 'zod';

export const supplierSchema = z.object({
  legal_name: z.string().min(2).max(150),
  trade_name: z.string().max(150).optional(),
  nit: z.string().max(30).optional(),
  contact_name: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().max(200).optional(),
  payment_terms: z.string().max(100).optional(),
  delivery_lead_time_days: z.number().int().nonnegative().optional(),
  dispatch_days: z.array(z.enum(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'])).optional(),
  min_order_value: z.number().nonnegative().optional(),
  rating: z.number().min(0).max(5).optional(),
  is_active: z.boolean().default(true),
});
export type SupplierInput = z.infer<typeof supplierSchema>;
