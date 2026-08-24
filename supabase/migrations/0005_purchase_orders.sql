-- ============================================================
-- GESCOMP — Migración 0005: Compras — agrupación por proveedor
-- y generación de orden (Fase 10)
-- ============================================================

-- ---------- Vista "Pedidos por Proveedor" ----------
-- Toma la consolidación de la Fase 9 y la cruza con el proveedor habitual (is_preferred)
-- de cada producto en ese establecimiento. Ítems sin proveedor habitual asignado quedan
-- en un grupo "sin_proveedor" para que el coordinador lo resuelva manualmente.
create or replace view v_pedidos_por_proveedor as
select
  c.establishment_id,
  coalesce(ps.supplier_id, '00000000-0000-0000-0000-000000000000'::uuid) as supplier_id,
  c.product_id,
  c.unregistered_product_name,
  c.unit_id,
  c.total_quantity,
  c.breakdown_by_area,
  c.has_urgent
from v_consolidated_requisition_items c
left join product_suppliers ps
  on ps.product_id = c.product_id
  and ps.establishment_id = c.establishment_id
  and ps.is_preferred = true;

-- ---------- Creación transaccional de la orden de compra ----------
-- p_items: jsonb array de:
--   { "product_id": uuid | null, "service_description": text | null,
--     "quantity": numeric, "unit_id": uuid, "agreed_unit_price": numeric | null,
--     "sources": [ { "requisition_item_id": uuid, "quantity_allocated": numeric }, ... ] }
create or replace function create_purchase_order_with_items(
  p_establishment_id uuid,
  p_supplier_id uuid,
  p_type text,
  p_expected_delivery_date date,
  p_delivery_place text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_order_id uuid;
  v_code text;
  v_item jsonb;
  v_source jsonb;
  v_item_id uuid;
  v_subtotal numeric := 0;
  v_line_total numeric;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Una orden debe tener al menos un ítem';
  end if;

  v_code := next_code(p_establishment_id, 'purchase_order', 'OC');

  insert into purchase_orders (code, establishment_id, supplier_id, buyer_id, type, status,
                                expected_delivery_date, delivery_place, notes)
  values (v_code, p_establishment_id, p_supplier_id, auth.uid(), p_type, 'orden_generada',
          p_expected_delivery_date, p_delivery_place, p_notes)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := (v_item->>'quantity')::numeric * coalesce((v_item->>'agreed_unit_price')::numeric, 0);
    v_subtotal := v_subtotal + v_line_total;

    insert into purchase_order_items (
      purchase_order_id, product_id, service_description, quantity, unit_id,
      agreed_unit_price, line_total
    ) values (
      v_order_id,
      nullif(v_item->>'product_id','')::uuid,
      nullif(v_item->>'service_description',''),
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_id')::uuid,
      nullif(v_item->>'agreed_unit_price','')::numeric,
      v_line_total
    )
    returning id into v_item_id;

    -- trazabilidad hacia el/los requerimiento(s) de origen
    for v_source in select * from jsonb_array_elements(coalesce(v_item->'sources', '[]'::jsonb))
    loop
      insert into purchase_order_item_sources (purchase_order_item_id, requisition_item_id, quantity_allocated)
      values (v_item_id, (v_source->>'requisition_item_id')::uuid, (v_source->>'quantity_allocated')::numeric);
    end loop;
  end loop;

  update purchase_orders set subtotal = v_subtotal, total = v_subtotal where id = v_order_id;
  -- nota: total = subtotal porque los precios ya incluyen impuestos (definido en Fase 2/6.6)

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by)
  values ('purchase_order', v_order_id, null, 'orden_generada', auth.uid());

  -- Un requerimiento pasa a 'en_orden' solo cuando TODOS sus ítems quedaron
  -- totalmente cubiertos por alguna orden (suma de quantity_allocated >= lo pedido).
  update requisitions r
  set status = 'en_orden'
  where r.status = 'enviado'
    and r.establishment_id = p_establishment_id
    and not exists (
      select 1 from requisition_items ri
      where ri.requisition_id = r.id
      and coalesce((
        select sum(pois.quantity_allocated)
        from purchase_order_item_sources pois
        where pois.requisition_item_id = ri.id
      ), 0) < ri.quantity
    );

  return v_order_id;
end;
$$;
