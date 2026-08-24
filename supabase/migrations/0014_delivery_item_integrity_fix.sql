-- ============================================================
-- GESCOMP — Migración 0014: corrección de integridad detectada en QA
-- (Fase 17): validar que el ítem de recepción pertenezca a la orden.
-- ============================================================

create or replace function create_delivery_with_items(
  p_purchase_order_id uuid,
  p_establishment_id uuid,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_delivery_id uuid;
  v_item jsonb;
  v_ordered numeric;
  v_received_total numeric;
  v_conforming boolean;
  v_any_novedad boolean := false;
  v_all_complete boolean := true;
  v_supplier_id uuid;
  v_product_id uuid;
  v_unit_id uuid;
  v_diff numeric;
  v_expected_date date;
  v_item_belongs boolean;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Una recepción debe tener al menos un ítem';
  end if;

  select supplier_id, expected_delivery_date into v_supplier_id, v_expected_date
  from purchase_orders where id = p_purchase_order_id;

  -- Corrección de integridad (Fase 17/QA): cada ítem debe pertenecer realmente a esta orden.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select exists (
      select 1 from purchase_order_items
      where id = (v_item->>'purchase_order_item_id')::uuid
        and purchase_order_id = p_purchase_order_id
    ) into v_item_belongs;

    if not v_item_belongs then
      raise exception 'El ítem % no pertenece a la orden %', v_item->>'purchase_order_item_id', p_purchase_order_id;
    end if;
  end loop;

  insert into deliveries (purchase_order_id, establishment_id, received_by, is_partial, notes)
  values (p_purchase_order_id, p_establishment_id, auth.uid(), false, p_notes)
  returning id into v_delivery_id;

  if v_expected_date is not null and current_date > v_expected_date then
    insert into alerts (type, establishment_id, entity_type, entity_id, severity, message)
    values ('entrega_tardia', p_establishment_id, 'delivery', v_delivery_id,
      case when current_date - v_expected_date > 3 then 'advertencia' else 'info' end,
      format('Entrega %s día(s) después de lo esperado', current_date - v_expected_date));
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select poi.quantity, poi.product_id, poi.unit_id
      into v_ordered, v_product_id, v_unit_id
    from purchase_order_items poi
    where poi.id = (v_item->>'purchase_order_item_id')::uuid;

    v_diff := (v_item->>'quantity_received')::numeric - v_ordered;
    v_conforming := (v_diff = 0);
    if not v_conforming then v_any_novedad := true; end if;

    insert into delivery_items (
      delivery_id, purchase_order_item_id, quantity_received, is_conforming,
      difference_reason, invoiced_unit_price, photo_attachment_id
    ) values (
      v_delivery_id, (v_item->>'purchase_order_item_id')::uuid,
      (v_item->>'quantity_received')::numeric, v_conforming,
      nullif(v_item->>'difference_reason',''), nullif(v_item->>'invoiced_unit_price','')::numeric,
      nullif(v_item->>'photo_attachment_id','')::uuid
    );

    if (v_item->>'invoiced_unit_price') is not null and v_product_id is not null then
      insert into price_history (
        product_id, supplier_id, establishment_id, unit_price, unit_id,
        source, purchase_order_id, delivery_id, recorded_by
      ) values (
        v_product_id, v_supplier_id, p_establishment_id,
        (v_item->>'invoiced_unit_price')::numeric, v_unit_id,
        'recepcion', p_purchase_order_id, v_delivery_id, auth.uid()
      );
    end if;

    select coalesce(sum(di.quantity_received), 0) into v_received_total
    from delivery_items di where di.purchase_order_item_id = (v_item->>'purchase_order_item_id')::uuid;

    if v_received_total < v_ordered then v_all_complete := false; end if;

    if v_diff <> 0 then
      insert into alerts (type, establishment_id, entity_type, entity_id, severity, message)
      values (
        'diferencia_recepcion', p_establishment_id, 'delivery', v_delivery_id,
        case when abs(v_diff) / nullif(v_ordered, 0) > 0.2 then 'critica'
             when abs(v_diff) / nullif(v_ordered, 0) > 0.05 then 'advertencia'
             else 'info' end,
        format('Diferencia en recepción: ordenado %s, recibido %s (%s)',
               v_ordered, (v_item->>'quantity_received')::numeric,
               case when v_diff > 0 then 'excedente' else 'faltante' end)
      );
    end if;
  end loop;

  update deliveries set is_partial = not v_all_complete where id = v_delivery_id;

  declare
    v_previous_status text;
    v_new_status text;
  begin
    select status into v_previous_status from purchase_orders where id = p_purchase_order_id;
    v_new_status := case when v_any_novedad then 'con_novedad'
                         when v_all_complete then 'recibida_totalmente'
                         else 'recibida_parcialmente' end;
    update purchase_orders set status = v_new_status where id = p_purchase_order_id;
    insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by, notes)
    values ('purchase_order', p_purchase_order_id, v_previous_status, v_new_status, auth.uid(), 'Registrado desde recepción móvil');
  end;

  return v_delivery_id;
end;
$$;
