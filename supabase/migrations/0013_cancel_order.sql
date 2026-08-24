-- ============================================================
-- GESCOMP — Migración 0013: Cancelación de orden (Fase 17)
-- Detectado en QA: el documento original pide probar "orden cancelada"
-- (sección 48) pero nunca se construyó la función — se agrega aquí.
-- ============================================================

create or replace function cancel_purchase_order(p_purchase_order_id uuid, p_reason text)
returns void
language plpgsql
security invoker
as $$
declare
  v_previous_status text;
  v_establishment_id uuid;
begin
  select status, establishment_id into v_previous_status, v_establishment_id
  from purchase_orders where id = p_purchase_order_id;

  if v_previous_status in ('recibida_totalmente','conciliada','cerrada') then
    raise exception 'No se puede cancelar una orden ya recibida totalmente, conciliada o cerrada';
  end if;

  update purchase_orders set status = 'cancelada' where id = p_purchase_order_id;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by, notes)
  values ('purchase_order', p_purchase_order_id, v_previous_status, 'cancelada', auth.uid(), p_reason);

  -- Los requerimientos que quedaron cubiertos por esta orden vuelven a 'enviado' para
  -- que compras pueda re-consolidarlos en otra orden — no se pierden ni quedan huérfanos.
  update requisitions r
  set status = 'enviado'
  where r.status = 'en_orden'
    and r.establishment_id = v_establishment_id
    and exists (
      select 1 from requisition_items ri
      join purchase_order_item_sources pois on pois.requisition_item_id = ri.id
      join purchase_order_items poi on poi.id = pois.purchase_order_item_id
      where ri.requisition_id = r.id and poi.purchase_order_id = p_purchase_order_id
    );
end;
$$;
