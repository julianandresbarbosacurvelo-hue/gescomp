-- ============================================================
-- GESCOMP — Migración 0026: AUDIT-001 (P0)
--
-- ANTES: close_purchase_order, cancel_purchase_order y reconcile_invoice
-- hacían UPDATE y, sin comprobar si afectó alguna fila, insertaban
-- incondicionalmente en status_history declarando el nuevo estado. Si
-- RLS bloqueaba el UPDATE (llamador sin permiso, ej. alguien golpeando
-- el RPC directo sin pasar por la UI), el UPDATE afectaba 0 filas en
-- silencio y status_history quedaba con una entrada falsa.
--
-- CAMBIO: `GET DIAGNOSTICS v_rows = ROW_COUNT;` inmediatamente después
-- de cada UPDATE. Si v_rows = 0, se lanza excepción explícita y no se
-- inserta nada en status_history — la función completa revierte (es
-- una sola transacción implícita de PL/pgSQL).
--
-- IMPACTO: ningún flujo legítimo cambia — un admin/coordinador_compras
-- cerrando/cancelando/conciliando una orden real siempre afecta 1 fila,
-- porque RLS ya lo autoriza. El único caso que cambia es el que debía
-- cambiar: ya no queda un registro de auditoría mintiendo sobre un
-- cambio que nunca ocurrió.
--
-- PRUEBA:
--   1. Flujo normal: cerrar/cancelar/conciliar una orden real como
--      admin → debe funcionar idéntico, status_history sigue
--      registrando el evento real.
--   2. Ataque simulado: invocar `cancel_purchase_order` directamente
--      vía RPC con la sesión de un usuario `cocina` (sin permiso sobre
--      purchase_orders) → antes de esta migración, insertaba una fila
--      en status_history diciendo "cancelada" sin cambiar nada; después
--      de esta migración, debe fallar con una excepción clara y no
--      dejar ningún rastro en status_history.
-- ============================================================

create or replace function close_purchase_order(p_purchase_order_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_previous text;
  v_rows int;
begin
  select status into v_previous from purchase_orders where id = p_purchase_order_id;

  update purchase_orders set status = 'cerrada' where id = p_purchase_order_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'No se pudo cerrar la orden: no autorizado o la orden no existe';
  end if;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by)
  values ('purchase_order', p_purchase_order_id, v_previous, 'cerrada', auth.uid());
end;
$$;

create or replace function cancel_purchase_order(p_purchase_order_id uuid, p_reason text)
returns void
language plpgsql
security invoker
as $$
declare
  v_previous_status text;
  v_establishment_id uuid;
  v_rows int;
begin
  select status, establishment_id into v_previous_status, v_establishment_id
  from purchase_orders where id = p_purchase_order_id;

  if v_previous_status in ('recibida_totalmente','conciliada','cerrada') then
    raise exception 'No se puede cancelar una orden ya recibida totalmente, conciliada o cerrada';
  end if;

  update purchase_orders set status = 'cancelada' where id = p_purchase_order_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'No se pudo cancelar la orden: no autorizado o la orden no existe';
  end if;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by, notes)
  values ('purchase_order', p_purchase_order_id, v_previous_status, 'cancelada', auth.uid(), p_reason);

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
  v_rows int;
begin
  select establishment_id, purchase_order_id, supplier_id
    into v_establishment_id, v_purchase_order_id, v_supplier_id
  from invoices where id = p_invoice_id;

  if v_purchase_order_id is null then
    raise exception 'No se pudo conciliar: la factura no existe o no es visible para este usuario';
  end if;

  select status into v_previous_status from purchase_orders where id = v_purchase_order_id;

  update invoices
  set reconciled_by = auth.uid(), reconciled_at = now(), final_amount_to_pay = p_final_amount_to_pay
  where id = p_invoice_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'No se pudo conciliar la factura: no autorizado';
  end if;

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
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'No se pudo actualizar el estado de la orden asociada: no autorizado';
  end if;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by, notes)
  values ('purchase_order', v_purchase_order_id, v_previous_status, 'conciliada', auth.uid(), 'Conciliación de factura');
end;
$$;
