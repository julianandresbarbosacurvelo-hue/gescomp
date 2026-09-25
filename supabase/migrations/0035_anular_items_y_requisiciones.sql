-- ============================================================
-- GESCOMP — Migración 0035: anular ítems/requisiciones + desbloqueo Novillano
-- ============================================================
--
-- ANTES: se reportó que la orden de compra del proveedor Novillano no se podía
-- generar — la pantalla "Generar orden de compra" mostraba el error genérico
-- de Next.js ("An error occurred in the Server Components render...") sin
-- decir la causa real, y las cantidades consolidadas seguían acumulándose
-- sin que el coordinador de compras pudiera enviar el pedido.
--
-- CAUSA RAÍZ (confirmada con evidencia real, no supuesta): el trigger
-- `trg_validate_unit_matches_product` exige que la unidad de cada
-- purchase_order_item coincida con la unidad de compra vigente del producto
-- en el catálogo — y hace bien su trabajo. El problema es "deriva de unidad":
-- 6 ítems de dos requerimientos viejos (REQ-RCS-2026-0006 del 2026-09-03 y
-- REQ-RCS-2026-0010 del 2026-09-03) quedaron pedidos en `kg` para 5 productos
-- cuyo `unit_id` en el catálogo cambió después (alrededor del 2026-09-16) a
-- `und`. Esos 6 ítems quedaron huérfanos: siguen "pendientes" (requisición en
-- 'enviado') y se siguen consolidando en Bandeja de Compras / Pedidos por
-- Proveedor, pero CUALQUIER intento de meterlos en una orden hace fallar el
-- trigger — y como `create_purchase_order_with_items` inserta todos los
-- ítems de la orden en una sola transacción, ese único ítem con conflicto
-- tumbaba la orden COMPLETA de Novillano, siempre, indefinidamente.
--
-- Se verificó ítem por ítem con los datos reales (impersonando a un
-- coordinador de compras real, sin persistir nada) que el error reproducido
-- es exactamente ese: "P0001: La unidad no coincide con la unidad de compra
-- definida para este producto".
--
-- Se verificó también, ANTES de decidir el alcance de esta migración, que
-- REQ-RCS-2026-0006 y REQ-RCS-2026-0010 NO son "requisiciones de Novillano":
-- son requerimientos normales de un área que mezclan productos de muchos
-- proveedores. REQ-RCS-2026-0006 tiene 32 ítems en total (solo 5 con
-- conflicto); REQ-RCS-2026-0010 tiene 14 (solo 1 con conflicto). Anular esas
-- requisiciones completas habría cancelado ~40 ítems válidos y vigentes de
-- otros proveedores que nada tienen que ver con este problema — por eso esta
-- migración anula solo los 6 ítems puntuales, no las requisiciones enteras.
--
-- Adicionalmente, el usuario pidió una funcionalidad nueva y permanente: que
-- el coordinador de compras y el administrador general puedan anular, antes
-- del cierre de una requisición, un ítem puntual o la requisición completa,
-- dejando un motivo (ej. se canceló un evento/reserva, cierre temporal del
-- establecimiento, etc.). Esta migración construye esa funcionalidad de una
-- vez, y la usa para resolver el caso de Novillano (en vez de un UPDATE
-- suelto), para que quede probada con un caso real desde el primer uso.
--
-- CAMBIO:
--   1. `requisition_items` gana `cancelled_at`, `cancelled_reason`,
--      `cancelled_by` (nullable) — permite anular un ítem puntual sin tocar
--      el resto de la requisición ni requerir un estado nuevo a nivel de
--      toda la requisición.
--   2. El check de `status_history.entity_type` se amplía para aceptar
--      también `'requisition_item'` (antes solo admitía
--      requisition/purchase_order/delivery/invoice), así la anulación de un
--      ítem queda trazada en el mismo historial que todo lo demás.
--   3. Función nueva `cancel_requisition_item(p_requisition_item_id, p_reason)`:
--      exige un motivo no vacío, valida que el ítem exista, que no esté ya
--      anulado, y que la requisición dueña siga en 'enviado' (no tiene
--      sentido anular un ítem de algo que ya se convirtió en orden, se
--      cerró o ya está cancelado). Marca el ítem y registra el historial.
--      `security invoker`: se apoya en la política RLS ya existente
--      `requisition_items_buyer_update` (exige `is_admin_or_buyer`, es decir
--      rol admin o coordinador_compras) — no se duplica ese chequeo acá.
--   4. Función nueva `cancel_requisition(p_requisition_id, p_reason)`: mismo
--      patrón que `cancel_purchase_order` (migración 0013) pero para
--      requisiciones — exige motivo, valida que siga en 'enviado', cambia a
--      'cancelado' y registra el historial. Se apoya en la política RLS
--      `requisitions_update_buyer` (mismo rol admin/coordinador_compras).
--   5. `v_consolidated_requisition_items` ahora excluye ítems anulados
--      (`cancelled_at is null`) — un ítem o requisición anulada desaparece
--      de inmediato de Bandeja de Compras y Pedidos por Proveedor, con el
--      mismo criterio que ya se usa para lo que quedó cubierto por una orden
--      (migración 0033).
--   6. Se anulan puntualmente los 6 ítems huérfanos de Novillano usando la
--      función nueva (no un UPDATE crudo), dejando el motivo y quedando
--      registrados en status_history como cualquier otra anulación futura.
--
-- DESCUBIERTO AL APLICAR (no estaba previsto en el diagnóstico original): al
-- intentar anular los 6 ítems huérfanos con un UPDATE normal, el trigger
-- `trg_validate_unit_matches_product` lo rechazó con el mismo error P0001 —
-- resulta que el trigger corre en BEFORE INSERT **OR UPDATE** sin condición,
-- así que revalida la unidad en CUALQUIER actualización de la fila, aunque
-- el UPDATE ni siquiera toque `unit_id`/`product_id`. Efecto secundario no
-- documentado: una vez que un ítem queda "huérfano" (unidad vieja), ya no se
-- le puede modificar NADA — ni anularlo, ni cambiarle la prioridad o una
-- nota — porque cualquier UPDATE reactiva la validación contra su propio
-- valor viejo. Se corrige acotando el trigger a `UPDATE OF product_id,
-- unit_id` (7. abajo), que es lo único que en realidad necesita revalidarse;
-- sigue bloqueando cualquier INSERT o cambio de unidad/producto inválido,
-- pero deja de bloquear actualizaciones que no tocan esos campos.
--
-- CAMBIO (continuación):
--   7. Los triggers `validate_unit_requisition_items` y
--      `validate_unit_purchase_order_items` pasan de `BEFORE INSERT OR
--      UPDATE` a `BEFORE INSERT OR UPDATE OF product_id, unit_id` — mismo
--      chequeo, pero solo se dispara cuando esas columnas participan del
--      UPDATE, no en cualquier otro cambio de la fila.
--
-- SEGUNDO HALLAZGO AL PROBAR CON IMPERSONACIÓN (tampoco estaba previsto): al
-- probar `cancel_requisition_item` como un coordinador de compras real (no
-- como postgres/SQL Editor, que se salta RLS), falló con "new row violates
-- row-level security policy for table status_history". Investigando se
-- encontró que existe una política `status_history_insert` en la base de
-- datos EN PRODUCCIÓN que NO está en ningún archivo de migración de este
-- repo (deriva/drift: alguien la creó directamente, probablemente por SQL
-- Editor, sin dejar la migración correspondiente) — permite insertar en
-- status_history solo para entity_type en
-- ('requisition','purchase_order','delivery','invoice'), cada uno validado
-- contra su tabla dueña. 'requisition_item' (el tipo nuevo de este archivo)
-- no estaba contemplado, así que cualquier INSERT con ese entity_type se
-- rechazaba pese a que el usuario sí tenía el rol correcto.
--
-- Se corrige agregando una política ADICIONAL (no se toca la existente,
-- para no arriesgar romper algo no versionado y ya en producción) — Postgres
-- combina varias políticas permisivas del mismo comando con OR, así que esto
-- solo AGREGA permiso para 'requisition_item', sin tocar los otros casos.
--
-- CAMBIO (continuación):
--   8. Política nueva `status_history_insert_requisition_item` en
--      status_history: permite insertar cuando entity_type =
--      'requisition_item', `changed_by = auth.uid()`, y quien inserta tiene
--      rol admin/coordinador_compras en el establecimiento dueño del
--      requerimiento del ítem.
--
-- NOTA IMPORTANTE PARA EL EQUIPO: la política `status_history_insert` ya
-- existente en producción no está en ningún archivo de este repo de
-- migraciones — este repo, tal como está, NO reconstruiría la base de datos
-- actual desde cero. Vale la pena, en algún momento, hacer un `pg_dump
-- --schema-only` (o equivalente) y comparar contra las migraciones
-- aplicadas para encontrar y documentar cualquier otro objeto en la misma
-- situación.
--
-- IMPACTO: no cambia ningún flujo existente para requisiciones/ítems que no
-- se anulen explícitamente. Los ~40 ítems válidos de REQ-RCS-2026-0006 y
-- REQ-RCS-2026-0010 (otros proveedores) quedan intactos y siguen su curso
-- normal. A partir de esta migración, Novillano puede generar su orden sin
-- los 5 productos huérfanos (deberán volver a pedirse en `und` en un
-- requerimiento nuevo si aún se necesitan). El ajuste de los triggers no
-- afecta ningún INSERT existente ni ningún UPDATE que sí cambie unidad o
-- producto — esos casos se siguen validando exactamente igual.
--
-- PRUEBA:
--   - `select cancel_requisition_item(<id de un ítem ya anulado>, 'x')` debe
--     fallar con 'Este ítem ya estaba anulado'.
--   - `select cancel_requisition_item(<id>, '')` debe fallar con 'Debes
--     indicar un motivo...'.
--   - Tras aplicar, `select * from v_pedidos_por_proveedor where
--     supplier_id = '4040a511-2a35-4f8e-b083-bdfa8b8feae5'` ya no debe traer
--     ninguna fila en `kg` para los 5 productos afectados, y "Generar orden
--     de compra" para Novillano debe completarse sin error.
--   - `select count(*) from requisition_items where requisition_id in
--     (select id from requisitions where code in
--     ('REQ-RCS-2026-0006','REQ-RCS-2026-0010')) and cancelled_at is null`
--     debe dar 32+14-6 = 40 (los ítems válidos siguen intactos y visibles).

alter table requisition_items
  add column cancelled_at timestamptz,
  add column cancelled_reason text,
  add column cancelled_by uuid references users(id);

drop trigger validate_unit_requisition_items on requisition_items;
create trigger validate_unit_requisition_items
  before insert or update of product_id, unit_id on requisition_items
  for each row execute function trg_validate_unit_matches_product();

drop trigger validate_unit_purchase_order_items on purchase_order_items;
create trigger validate_unit_purchase_order_items
  before insert or update of product_id, unit_id on purchase_order_items
  for each row execute function trg_validate_unit_matches_product();

alter table status_history drop constraint status_history_entity_type_check;
alter table status_history add constraint status_history_entity_type_check
  check (entity_type in ('requisition', 'purchase_order', 'delivery', 'invoice', 'requisition_item'));

create policy status_history_insert_requisition_item on status_history
  for insert
  with check (
    changed_by = auth.uid()
    and entity_type = 'requisition_item'
    and exists (
      select 1 from requisition_items ri
      join requisitions r on r.id = ri.requisition_id
      where ri.id = status_history.entity_id
        and is_admin_or_buyer(r.establishment_id)
    )
  );

create or replace function cancel_requisition_item(p_requisition_item_id uuid, p_reason text)
returns void
language plpgsql
security invoker
as $$
declare
  v_requisition_id uuid;
  v_requisition_status text;
  v_already_cancelled timestamptz;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Debes indicar un motivo para anular este ítem';
  end if;

  select ri.requisition_id, r.status, ri.cancelled_at
    into v_requisition_id, v_requisition_status, v_already_cancelled
  from requisition_items ri
  join requisitions r on r.id = ri.requisition_id
  where ri.id = p_requisition_item_id;

  if v_requisition_id is null then
    raise exception 'Ítem de requerimiento no encontrado';
  end if;

  if v_already_cancelled is not null then
    raise exception 'Este ítem ya estaba anulado';
  end if;

  if v_requisition_status <> 'enviado' then
    raise exception 'Solo se puede anular un ítem de un requerimiento que aún está enviado (pendiente); este requerimiento está en estado %', v_requisition_status;
  end if;

  update requisition_items
  set cancelled_at = now(), cancelled_reason = p_reason, cancelled_by = auth.uid()
  where id = p_requisition_item_id;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by, notes)
  values ('requisition_item', p_requisition_item_id, 'pendiente', 'anulado', auth.uid(), p_reason);
end;
$$;

create or replace function cancel_requisition(p_requisition_id uuid, p_reason text)
returns void
language plpgsql
security invoker
as $$
declare
  v_previous_status text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Debes indicar un motivo para anular este requerimiento';
  end if;

  select status into v_previous_status from requisitions where id = p_requisition_id;

  if v_previous_status is null then
    raise exception 'Requerimiento no encontrado';
  end if;

  if v_previous_status <> 'enviado' then
    raise exception 'Solo se puede anular un requerimiento que aún está enviado (pendiente); este está en estado %', v_previous_status;
  end if;

  update requisitions set status = 'cancelado' where id = p_requisition_id;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by, notes)
  values ('requisition', p_requisition_id, v_previous_status, 'cancelado', auth.uid(), p_reason);
end;
$$;

create or replace view v_consolidated_requisition_items as
select
  r.establishment_id,
  ri.product_id,
  ri.unregistered_product_name,
  ri.unit_id,
  sum(pend.pending_quantity) as total_quantity,
  jsonb_agg(jsonb_build_object(
    'area_code', a.code,
    'area_name', a.name,
    'quantity', pend.pending_quantity,
    'requisition_id', r.id,
    'requisition_item_id', ri.id,
    'priority', ri.priority
  )) as breakdown_by_area,
  (max(ri.priority) filter (where ri.priority = 'urgente') is not null) as has_urgent
from requisition_items ri
join requisitions r on r.id = ri.requisition_id
join areas a on a.id = r.area_id
cross join lateral (
  select (ri.quantity - coalesce(
    (select sum(pois.quantity_allocated) from purchase_order_item_sources pois where pois.requisition_item_id = ri.id),
    0::numeric
  )) as pending_quantity
) pend
where r.status = 'enviado'
  and ri.cancelled_at is null
  and pend.pending_quantity > 0::numeric
group by r.establishment_id, ri.product_id, ri.unregistered_product_name, ri.unit_id;

-- Desbloqueo puntual de Novillano: anula los 6 ítems huérfanos (kg viejo,
-- productos que ya cambiaron a und en el catálogo).
--
-- NOTA: no se usa `cancel_requisition_item` acá arriba a propósito — esa
-- función usa `auth.uid()` para registrar quién anuló (correcto cuando la
-- llama la app con un usuario logueado), pero una migración corre sin sesión
-- de usuario autenticado: `auth.uid()` sería null y violaría el `not null`
-- de `status_history.changed_by`. Este bloque hace lo mismo a mano, dejando
-- registrado como responsable a un administrador real (Julian Barbosa) para
-- no perder la trazabilidad.
do $$
declare
  v_admin_id uuid;
  v_reason text := 'Unidad de compra del producto cambió después de creado el requerimiento (kg → und); el ítem quedó huérfano y bloqueaba la generación de la orden de Novillano. Debe volver a pedirse en la unidad vigente si aún se necesita.';
  v_item_id uuid;
  v_item_ids uuid[] := array[
    'a51fd707-20eb-4bb1-96c9-fd06c3097b6d', -- Carne Para Asar 150 gm (REQ-RCS-2026-0006)
    'fd004094-6f66-4000-a89b-76b706ce8006', -- Mango Tommy Verde (REQ-RCS-2026-0006)
    '9ad3258c-011a-4834-a23a-7e2a2f83afe0', -- Pechuga Entera (REQ-RCS-2026-0006)
    '9cc1c05b-e446-4284-bcde-1c514d485a92', -- Platano Maduro (REQ-RCS-2026-0006)
    '360cec0f-1941-4f03-afa8-094a0e467685', -- Platano Verde (REQ-RCS-2026-0006)
    '8133dd19-e01d-440c-99ec-6b9de5152c2d'  -- Carne Para Asar 150 gm (REQ-RCS-2026-0010)
  ];
begin
  select id into v_admin_id from users where email = 'julianandresbarbosacurvelo@gmail.com';

  foreach v_item_id in array v_item_ids loop
    update requisition_items
    set cancelled_at = now(), cancelled_reason = v_reason, cancelled_by = v_admin_id
    where id = v_item_id and cancelled_at is null;

    insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by, notes)
    values ('requisition_item', v_item_id, 'pendiente', 'anulado', v_admin_id, v_reason);
  end loop;
end $$;
