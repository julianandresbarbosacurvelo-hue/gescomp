export type CartItem = {
  key: string; // product_id, o 'unregistered:<nombre>' para productos no catalogados
  product_id?: string;
  unregistered_product_name?: string;
  name: string;
  unit_id: string;
  unit_code?: string;
  quantity: number;
  priority?: 'normal' | 'alta' | 'urgente';
};
