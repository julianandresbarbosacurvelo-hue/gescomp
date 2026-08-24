export type ReceivingItemState = {
  purchase_order_item_id: string;
  product_id?: string;
  name: string;
  unit_code?: string;
  ordered: number;
  pending: number;
  quantity_received: number;
  hasNovedad: boolean;
  difference_reason?: string;
  showPriceInput: boolean;
  invoiced_unit_price?: number;
  photoFile?: File;
};
