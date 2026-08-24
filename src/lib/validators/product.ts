import { z } from 'zod';

export const productSchema = z.object({
  internal_code: z.string().max(30).optional(),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(150),
  description: z.string().max(500).optional(),
  category_id: z.string().uuid('Selecciona una categoría'),
  subcategory_id: z.string().uuid().optional().nullable(),
  unit_id: z.string().uuid('Selecciona la unidad de compra'),
  preferred_brand: z.string().max(100).optional(),
  is_active: z.boolean().default(true),
});

export type ProductInput = z.infer<typeof productSchema>;

// Ítem "producto no registrado" dentro de un requerimiento — no crea fila en `products`.
export const unregisteredProductItemSchema = z.object({
  unregistered_product_name: z.string().min(2).max(150),
  quantity: z.number().positive(),
  unit_id: z.string().uuid(),
  notes: z.string().max(300).optional(),
});
