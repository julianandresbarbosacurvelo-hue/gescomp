-- ============================================================
-- GESCOMP — Migración 0011: Detección de anomalías (Fase 15)
-- Completa los 7 tipos de la sección 27 del documento original:
-- ya existían diferencia_recepcion (0007) y diferencia_factura (0008).
-- Aquí se agregan: precio_anormal, cantidad_anormal, frecuencia_anormal,
-- proveedor_diferente, entrega_tardia.
-- ============================================================

-- ---------- precio_anormal: trigger sobre price_history ----------
create or replace function trg_check_price_anomaly() returns trigger
language plpgsql as $$
declare
  v_avg_90 numeric;
  v_variation numeric;
begin
  select avg(unit_price) into v_avg_90
  from price_history
  where product_id = new.product_id
    and establishment_id = new.establishment_id
    and recorded_at >= new.recorded_at - interval '90 days'
    and recorded_at < new.recorded_at;

  if v_avg_90 is not null and v_avg_90 > 0 then
    v_variation := (new.unit_price - v_avg_90) / v_avg_90;

    if abs(v_variation) > 0.05 then
      insert into alerts (type, establishment_id, entity_type, entity_id, severity, message)
      values (
        'precio_anormal', new.establishment_id, 'price_history', new.id,
        case when abs(v_variation) > 0.20 then 'critica'
             when abs(v_variation) > 0.10 then 'advertencia'
             else 'info' end,
        format('Precio %s%% vs. promedio 90 días (nuevo: %s, promedio: %s)',
               round(v_variation * 100, 1), new.unit_price, round(v_avg_90, 2))
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists price_history_anomaly on price_history;
create trigger price_history_anomaly
  after insert on price_history
  for each row execute function trg_check_price_anomaly();

-- ---------- UPDATE en alerts (la Fase 7 solo dejó SELECT) — necesario para "resolver" ----------
create policy alerts_update on alerts for update
  using (is_admin_or_buyer(establishment_id));

-- ---------- cantidad_anormal y frecuencia_anormal: se evalúan al crear el requerimiento ----------
create or replace function create_requisition_with_items(
  p_establishment_id uuid,
  p_area_id uuid,
  p_required_date date,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_requisition_id uuid;
  v_code text;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_avg_qty numeric;
  v_last_date date;
  v_avg_days numeric;
  v_days_since_last numeric;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Un requerimiento debe tener al menos un ítem';
  end if;

  v_code := next_code(p_establishment_id, 'requisition', 'REQ');

  insert into requisitions (code, establishment_id, area_id, requested_by, status, required_date, notes)
  values (v_code, p_establishment_id, p_area_id, auth.uid(), 'enviado', p_required_date, p_notes)
  returning id into v_requisition_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_qty := (v_item->>'quantity')::numeric;

    insert into requisition_items (
      requisition_id, product_id, unregistered_product_name, quantity, unit_id, priority, notes
    ) values (
      v_requisition_id, v_product_id, nullif(v_item->>'unregistered_product_name',''),
      v_qty, (v_item->>'unit_id')::uuid, nullif(v_item->>'priority',''), nullif(v_item->>'notes','')
    );

    if v_product_id is not null then
      -- cantidad_anormal: comparar contra el promedio de las últimas 8 solicitudes del producto
      select avg(ri.quantity) into v_avg_qty
      from requisition_items ri
      join requisitions r on r.id = ri.requisition_id
      where ri.product_id = v_product_id and r.establishment_id = p_establishment_id and r.id <> v_requisition_id;

      if v_avg_qty is not null and v_avg_qty > 0 and v_qty > v_avg_qty * 1.5 then
        insert into alerts (type, establishment_id, entity_type, entity_id, severity, message)
        values ('cantidad_anormal', p_establishment_id, 'requisition_item', v_requisition_id, 'advertencia',
          format('Cantidad %s%% superior al promedio histórico (%s vs. %s)',
                 round(((v_qty - v_avg_qty) / v_avg_qty) * 100), v_qty, round(v_avg_qty, 1)));
      end if;

      -- frecuencia_anormal: ¿se vuelve a pedir mucho antes de lo habitual?
      select max(r.created_at::date) into v_last_date
      from requisition_items ri join requisitions r on r.id = ri.requisition_id
      where ri.product_id = v_product_id and r.establishment_id = p_establishment_id and r.id <> v_requisition_id;

      if v_last_date is not null then
        v_days_since_last := current_date - v_last_date;

        select avg(dias) into v_avg_days
        from (
          select r.created_at::date - lag(r.created_at::date) over (order by r.created_at) as dias
          from requisition_items ri join requisitions r on r.id = ri.requisition_id
          where ri.product_id = v_product_id and r.establishment_id = p_establishment_id
        ) d where dias is not null;

        if v_avg_days is not null and v_avg_days > 2 and v_days_since_last < v_avg_days * 0.4 then
          insert into alerts (type, establishment_id, entity_type, entity_id, severity, message)
          values ('frecuencia_anormal', p_establishment_id, 'requisition_item', v_requisition_id, 'info',
            format('Se solicita de nuevo tras %s días (habitual: %s días)', v_days_since_last, round(v_avg_days, 1)));
        end if;
      end if;
    end if;
  end loop;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by)
  values ('requisition', v_requisition_id, null, 'enviado', auth.uid());

  return v_requisition_id;
end;
$$;

-- ---------- proveedor_diferente: se evalúa al generar la orden ----------
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
      insert into purchase_order_item_sources (purchase_order_item_id, requisition_item_id, quantity_allocated)
      values (v_item_id, (v_source->>'requisition_item_id')::uuid, (v_source->>'quantity_allocated')::numeric);
    end loop;

    -- proveedor_diferente: ¿este producto se está comprando a alguien distinto de su habitual?
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

-- ---------- entrega_tardia: se evalúa al registrar la recepción ----------
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
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Una recepción debe tener al menos un ítem';
  end if;

  select supplier_id, expected_delivery_date into v_supplier_id, v_expected_date
  from purchase_orders where id = p_purchase_order_id;

  insert into deliveries (purchase_order_id, establishment_id, received_by, is_partial, notes)
  values (p_purchase_order_id, p_establishment_id, auth.uid(), false, p_notes)
  returning id into v_delivery_id;

  -- entrega_tardia: comparar la fecha real de esta recepción contra la esperada
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
