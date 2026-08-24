-- ============================================================
-- GESCOMP — Migración 0025: DATA-002 (P0)
--
-- ANTES: create_purchase_order_with_items insertaba en
-- purchase_order_item_sources cualquier requisition_item_id recibido,
-- sin validar que perteneciera a un requerimiento del mismo
-- establishment_id que la orden. Sin RLS en esa tabla (ya corregido en
-- SEC-001) y sin esta validación, la trazabilidad financiera entre
-- requerimiento y orden podía apuntar a otro establecimiento.
--
-- CAMBIO: antes de insertar cada fuente, se valida que el
-- requisition_item pertenezca a una requisition con el mismo
-- establishment_id que p_establishment_id. Si no, excepción explícita
-- y no se inserta nada de esa orden (todo-o-nada, es una sola función
-- plpgsql, ya es transaccional por naturaleza).
--
-- IMPACTO: ningún flujo legítimo cambia — la Bandeja de Compras y
-- Pedidos por Proveedor ya solo muestran (y por tanto solo pueden
-- enviar) ítems consolidados del establecimiento activo, así que las
-- fuentes que llegan desde el frontend real siempre pertenecen al
-- mismo establecimiento. El único caso que deja de funcionar es el
-- que debía dejar de funcionar.
--
-- PRUEBA:
--   1. Flujo normal: generar una orden desde "Pedidos por Proveedor"
--      con ítems consolidados reales → debe seguir funcionando
--      idéntico, cada purchase_order_item_source se crea igual que
--      antes.
--   2. Ataque simulado: llamar al RPC directamente con
--      establishment_id de Bogotá pero un requisition_item_id real
--      de un requerimiento de Medellín en `sources` → debe fallar con
--      la excepción explícita, sin crear la orden ni ningún ítem.
-- ============================================================

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
  v_product_id uuid;
  v_subtotal numeric := 0;
  v_line_total numeric;
  v_preferred_supplier uuid;
  v_source_belongs boolean;
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
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_line_total := (v_item->>'quantity')::numeric * coalesce((v_item->>'agreed_unit_price')::numeric, 0);
    v_subtotal := v_subtotal + v_line_total;

    insert into purchase_order_items (
      purchase_order_id, product_id, service_description, quantity, unit_id,
      agreed_unit_price, line_total
    ) values (
      v_order_id, v_product_id, nullif(v_item->>'service_description',''),
      (v_item->>'quantity')::numeric, (v_item->>'unit_id')::uuid,
      nullif(v_item->>'agreed_unit_price','')::numeric, v_line_total
    )
    returning id into v_item_id;

    for v_source in select * from jsonb_array_elements(coalesce(v_item->'sources', '[]'::jsonb))
    loop
      -- DATA-002: el requisition_item de origen debe pertenecer a un
      -- requerimiento del MISMO establecimiento que esta orden.
      select exists (
        select 1 from requisition_items ri
        join requisitions r on r.id = ri.requisition_id
        where ri.id = (v_source->>'requisition_item_id')::uuid
          and r.establishment_id = p_establishment_id
      ) into v_source_belongs;

      if not v_source_belongs then
        raise exception 'El requerimiento de origen % no pertenece a este establecimiento',
          v_source->>'requisition_item_id';
      end if;

      insert into purchase_order_item_sources (purchase_order_item_id, requisition_item_id, quantity_allocated)
      values (v_item_id, (v_source->>'requisition_item_id')::uuid, (v_source->>'quantity_allocated')::numeric);
    end loop;

    if v_product_id is not null then
      select supplier_id into v_preferred_supplier
      from product_suppliers
      where product_id = v_product_id and establishment_id = p_establishment_id and is_preferred = true;

      if v_preferred_supplier is not null and v_preferred_supplier <> p_supplier_id then
        insert into alerts (type, establishment_id, entity_type, entity_id, severity, message)
        values ('proveedor_diferente', p_establishment_id, 'purchase_order', v_order_id, 'info',
          'Producto adquirido a un proveedor distinto del habitual');
      end if;
    end if;
  end loop;

  update purchase_orders set subtotal = v_subtotal, total = v_subtotal where id = v_order_id;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by)
  values ('purchase_order', v_order_id, null, 'orden_generada', auth.uid());

  update requisitions r
  set status = 'en_orden'
  where r.status = 'enviado'
    and r.establishment_id = p_establishment_id
    and not exists (
      select 1 from requisition_items ri
      where ri.requisition_id = r.id
      and coalesce((select sum(pois.quantity_allocated) from purchase_order_item_sources pois
                    where pois.requisition_item_id = ri.id), 0) < ri.quantity
    );

  return v_order_id;
end;
$$;
