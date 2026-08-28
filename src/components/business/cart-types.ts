export interface CartItem {
  key: string;
  name: string;
  quantity: number;
  unit_code?: string;
  priority?: 'normal' | 'alta' | 'urgente';
}
