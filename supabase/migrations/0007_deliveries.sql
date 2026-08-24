-- ============================================================
-- GESCOMP — Migración 0007: Recepciones (Fase 11)
-- ============================================================

-- ---------- INSERT en price_history (la Fase 7 solo dejó SELECT definido) ----------
-- El receptor puede registrar precio de factura al recibir (source='recepcion').
create policy price_history_insert_recepcion on price_history for insert
  with check (
    source = 'recepcion'
    and recorded_by = auth.uid()
    and has_any_role(establishment_id)
  );
-- El coordinador/admin puede registrar precio en conciliación (Fase 13) o ajuste manual.
create policy price_history_insert_buyer on price_history for insert
  with check (
    source in ('conciliacion','ajuste_manual')
    and recorded_by = auth.uid()
    and is_admin_or_buyer(establishment_id)
  );

-- ---------- UPDATE en delivery_items (la Fase 7 solo dejó SELECT/INSERT) ----------
-- Necesario para adjuntar la foto después de crear la recepción (ver uploadDeliveryPhoto).
create policy delivery_items_update_own on delivery_items for update
  using (exists (select 1 from deliveries d where d.id = delivery_id and d.received_by = auth.uid()));

-- ---------- Bucket de Storage para evidencias de recepción ----------
insert into storage.buckets (id, name, public)
values ('evidencias-recepcion', 'evidencias-recepcion', true)
on conflict (id) do nothing;

create policy evidencias_recepcion_upload on storage.objects for insert
  with check (
    bucket_id = 'evidencias-recepcion'
    and exists (select 1 from user_roles where user_id = auth.uid())
  );
create policy evidencias_recepcion_read on storage.objects for select
  using (bucket_id = 'evidencias-recepcion');

-- ---------- Creación transaccional de la recepción ----------
-- p_items: jsonb array de:
--   { "purchase_order_item_id": uuid, "quantity_received": numeric,
--     "difference_reason": text | null, "invoiced_unit_price": numeric | null,
--     "photo_attachment_id": uuid | null }
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
  v_received_total numeric; -- acumulado de TODAS las entregas de ese ítem, incluida ésta
  v_conforming boolean;
  v_any_novedad boolean := false;
  v_all_complete boolean := true;
  v_supplier_id uuid;
  v_product_id uuid;
  v_unit_id uuid;
  v_diff numeric;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Una recepción debe tener al menos un ítem';
  end if;

  select supplier_id into v_supplier_id from purchase_orders where id = p_purchase_order_id;

  insert into deliveries (purchase_order_id, establishment_id, received_by, is_partial, notes)
  values (p_purchase_order_id, p_establishment_id, auth.uid(), false, p_notes) -- is_partial se corrige al final
  returning id into v_delivery_id;

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
      v_delivery_id,
      (v_item->>'purchase_order_item_id')::uuid,
      (v_item->>'quantity_received')::numeric,
      v_conforming,
      nullif(v_item->>'difference_reason',''),
      nullif(v_item->>'invoiced_unit_price','')::numeric,
      nullif(v_item->>'photo_attachment_id','')::uuid
    );

    -- Precio de factura opcional capturado en el andén → histórico de precios (source='recepcion')
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

    -- ¿Ya se completó este ítem sumando todas las entregas hechas hasta ahora?
    select coalesce(sum(di.quantity_received), 0) into v_received_total
    from delivery_items di
    where di.purchase_order_item_id = (v_item->>'purchase_order_item_id')::uuid;

    if v_received_total < v_ordered then
      v_all_complete := false;
    end if;

    -- Alerta si hay diferencia relevante
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
    v_new_status := case
      when v_any_novedad then 'con_novedad'
      when v_all_complete then 'recibida_totalmente'
      else 'recibida_parcialmente'
    end;

    update purchase_orders set status = v_new_status where id = p_purchase_order_id;

    insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by, notes)
    values ('purchase_order', p_purchase_order_id, v_previous_status, v_new_status, auth.uid(), 'Registrado desde recepción móvil');
  end;

  return v_delivery_id;
end;
$$;
