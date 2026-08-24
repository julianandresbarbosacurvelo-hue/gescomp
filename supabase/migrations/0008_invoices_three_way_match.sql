-- ============================================================
-- GESCOMP — Migración 0008: Facturas, Three-Way Match y
-- Conciliación (Fase 12)
-- ============================================================

-- ---------- Creación transaccional de la factura ----------
-- p_items: jsonb array de:
--   { "purchase_order_item_id": uuid, "quantity_invoiced": numeric, "unit_price_invoiced": numeric }
create or replace function create_invoice_with_items(
  p_purchase_order_id uuid,
  p_establishment_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_file_attachment_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_invoice_id uuid;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_line_total numeric;
  v_ordered numeric;
  v_received numeric;
  v_invoiced numeric;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Una factura debe tener al menos un ítem';
  end if;

  insert into invoices (establishment_id, purchase_order_id, supplier_id, invoice_number, invoice_date,
                         file_attachment_id, total)
  values (p_establishment_id, p_purchase_order_id, p_supplier_id, p_invoice_number, p_invoice_date,
          p_file_attachment_id, 0)
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := (v_item->>'quantity_invoiced')::numeric * (v_item->>'unit_price_invoiced')::numeric;
    v_subtotal := v_subtotal + v_line_total;

    insert into invoice_items (invoice_id, purchase_order_item_id, quantity_invoiced, unit_price_invoiced, line_total)
    values (v_invoice_id, (v_item->>'purchase_order_item_id')::uuid,
            (v_item->>'quantity_invoiced')::numeric, (v_item->>'unit_price_invoiced')::numeric, v_line_total);

    -- ---------- Three-Way Match: orden vs. recepción vs. factura ----------
    select quantity into v_ordered from purchase_order_items where id = (v_item->>'purchase_order_item_id')::uuid;

    select coalesce(sum(di.quantity_received), 0) into v_received
    from delivery_items di where di.purchase_order_item_id = (v_item->>'purchase_order_item_id')::uuid;

    v_invoiced := (v_item->>'quantity_invoiced')::numeric;

    if v_invoiced <> v_received or v_invoiced <> v_ordered then
      insert into alerts (type, establishment_id, entity_type, entity_id, severity, message)
      values (
        'diferencia_factura', p_establishment_id, 'invoice', v_invoice_id,
        case when abs(v_invoiced - v_received) / nullif(v_received, 0) > 0.1 then 'critica' else 'advertencia' end,
        format('Three-way match: ordenado %s, recibido %s, facturado %s', v_ordered, v_received, v_invoiced)
      );
    end if;
  end loop;

  update invoices set subtotal = v_subtotal, total = v_subtotal where id = v_invoice_id;
  -- total = subtotal: precios con impuestos incluidos, igual que en purchase_orders.

  return v_invoice_id;
end;
$$;

-- ---------- Conciliación: el coordinador fija el valor final a pagar ----------
-- p_price_adjustments (opcional): [{ "product_id": uuid, "unit_price": numeric, "unit_id": uuid }]
-- Si se envía, cada uno queda en price_history con source='conciliacion' y ese pasa a ser
-- el precio vigente del producto (por ser el registro más reciente).
create or replace function reconcile_invoice(
  p_invoice_id uuid,
  p_final_amount_to_pay numeric,
  p_price_adjustments jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
as $$
declare
  v_establishment_id uuid;
  v_purchase_order_id uuid;
  v_supplier_id uuid;
  v_previous_status text;
  v_adj jsonb;
begin
  select establishment_id, purchase_order_id, supplier_id
    into v_establishment_id, v_purchase_order_id, v_supplier_id
  from invoices where id = p_invoice_id;

  select status into v_previous_status from purchase_orders where id = v_purchase_order_id;

  update invoices
  set reconciled_by = auth.uid(), reconciled_at = now(), final_amount_to_pay = p_final_amount_to_pay
  where id = p_invoice_id;

  for v_adj in select * from jsonb_array_elements(p_price_adjustments)
  loop
    insert into price_history (product_id, supplier_id, establishment_id, unit_price, unit_id,
                                source, purchase_order_id, invoice_id, recorded_by)
    values (
      (v_adj->>'product_id')::uuid, v_supplier_id, v_establishment_id,
      (v_adj->>'unit_price')::numeric, (v_adj->>'unit_id')::uuid,
      'conciliacion', v_purchase_order_id, p_invoice_id, auth.uid()
    );
  end loop;

  update purchase_orders set status = 'conciliada' where id = v_purchase_order_id;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by, notes)
  values ('purchase_order', v_purchase_order_id, v_previous_status, 'conciliada', auth.uid(), 'Conciliación de factura');
end;
$$;

-- ---------- Cierre de la orden ----------
create or replace function close_purchase_order(p_purchase_order_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_previous text;
begin
  select status into v_previous from purchase_orders where id = p_purchase_order_id;
  update purchase_orders set status = 'cerrada' where id = p_purchase_order_id;
  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by)
  values ('purchase_order', p_purchase_order_id, v_previous, 'cerrada', auth.uid());
end;
$$;
