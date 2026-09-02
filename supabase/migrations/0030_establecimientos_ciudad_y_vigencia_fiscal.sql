-- ============================================================
-- GESCOMP — Migración 0030: ciudad real de establecimientos,
-- prefijos de consecutivo corregidos, numeración con vigencia
-- fiscal, y parche RLS de recepción (documentado, ya vigente)
-- ============================================================

-- ---------- 1) Ciudad real de los establecimientos ----------
-- ANTES: al renombrar "Gescomp Sede Bogotá" -> "Restaurante Cielo y
-- Sazón" y "Gescomp Sede Medellín" -> "Hotel Axagua" (ver historial en
-- memoria del proyecto) solo se cambió el nombre visible — el
-- short_code (BOG/MED, usado en los consecutivos OC-BOG-0001,
-- REQ-BOG-0001...) y la dirección demo ("...Bogotá" / "...Medellín")
-- quedaron sin corregir. Ambos establecimientos están en realidad en
-- Villavicencio y San Martín (Meta) respectivamente — nunca en Bogotá
-- ni Medellín.
--
-- CAMBIO: se agrega la columna `city` (no existía ninguna columna de
-- ciudad; `address` sí existía desde la 0001 pero no se exponía en la
-- pantalla de Establecimientos). Se corrige short_code y city para los
-- 2 establecimientos reales. La dirección demo ("Cra 15 #85-20,
-- Bogotá" / "Cl 10 #40-15, Medellín") se limpia a NULL en vez de
-- inventar una dirección real que no tenemos confirmada — debe
-- completarse desde la pantalla de Establecimientos (ver cambio de UI
-- en el mismo commit, que ahora permite editar un establecimiento
-- existente, no solo crearlo).
--
-- IMPACTO: `next_code()` arma el prefijo del consecutivo leyendo
-- `short_code` en el momento de generar el código — no requiere tocar
-- la función, el cambio de short_code ya alcanza para que las próximas
-- órdenes/requerimientos salgan como OC-RCS-... / REQ-AXA-... en vez
-- de OC-BOG-... / REQ-MED-.... Los códigos YA EMITIDOS (ej.
-- OC-BOG-0001, OC-BOG-0002 y los 5 REQ-BOG-... existentes) NO se
-- renumeran ni se les cambia el texto — son historial y deben
-- mantenerse tal como se emitieron. El contador (code_counters) sigue
-- su cuenta normal, no se reinicia a 0 con este cambio de prefijo.
--
-- PRUEBA: generar un nuevo requerimiento u orden desde cualquiera de
-- los 2 establecimientos → el código debe salir con el nuevo prefijo
-- (RCS/AXA) y siguiendo el consecutivo donde iba (ej. si el último fue
-- OC-...-0002, el próximo debe incluir el número 3, ahora con formato
-- de vigencia fiscal — ver sección 2 más abajo).

alter table establishments add column if not exists city text;

update establishments set short_code = 'RCS', city = 'Villavicencio', address = null
  where id = '11111111-1111-1111-1111-111111111111';
update establishments set short_code = 'AXA', city = 'San Martín', address = null
  where id = '22222222-2222-2222-2222-222222222222';

-- ---------- 2) Numeración con vigencia fiscal (año) ----------
-- ANTES: code_counters tenía una sola fila por (establishment_id,
-- entity_type) que crecía indefinidamente — el consecutivo de un
-- establecimiento nunca podía "cerrar el año" ni distinguir en qué
-- vigencia fiscal se emitió cada código.
--
-- CAMBIO: se agrega `fiscal_year` a la llave primaria de
-- code_counters. `next_code()` calcula el año actual con
-- extract(year from now()) y arma el código como
-- {prefijo}-{short_code}-{año}-{número}, ej. OC-RCS-2026-0001. El
-- `on conflict` ahora apunta a (establishment_id, entity_type,
-- fiscal_year), así que el 1 de enero de cada año siguiente
-- (2027, 2028...) la primera llamada de next_code() para ese
-- establecimiento/tipo no encuentra fila para el nuevo año, inserta
-- una nueva empezando en 1, y el consecutivo "reinicia" solo — sin
-- necesidad de ningún proceso manual ni tarea programada. Los
-- contadores existentes (purchase_order=2, requisition=5, ambos del
-- establecimiento RCS) se etiquetan con el año actual (2026), que es
-- el año real en que se emitieron.
--
-- IMPACTO: la firma de next_code() no cambia (mismos 3 parámetros),
-- así que ninguno de los llamadores (create_requisition_with_items,
-- create_purchase_order_with_items, Fases 9/10/12) necesita
-- modificarse. Los códigos ya emitidos (formato viejo, sin año) no se
-- tocan — solo los códigos nuevos, a partir de este cambio, incluyen
-- el año.
--
-- PRUEBA: generar un requerimiento hoy (2026) → código
-- REQ-RCS-2026-0006 (siguiente número tras los 5 ya emitidos).
-- No es posible probar el rollover de año en vivo hoy, pero la lógica
-- es la misma que ya usa el `on conflict` de la fila actual — solo se
-- agrega una columna más a la llave.

alter table code_counters add column if not exists fiscal_year int;
update code_counters set fiscal_year = extract(year from now())::int where fiscal_year is null;
alter table code_counters alter column fiscal_year set not null;
alter table code_counters drop constraint if exists code_counters_pkey;
alter table code_counters add primary key (establishment_id, entity_type, fiscal_year);

create or replace function next_code(p_establishment_id uuid, p_entity_type text, p_prefix text)
returns text
language plpgsql
as $$
declare
  v_number int;
  v_short_code text;
  v_year int := extract(year from now())::int;
begin
  insert into code_counters (establishment_id, entity_type, fiscal_year, last_number)
  values (p_establishment_id, p_entity_type, v_year, 1)
  on conflict (establishment_id, entity_type, fiscal_year)
  do update set last_number = code_counters.last_number + 1
  returning last_number into v_number;

  select short_code into v_short_code from establishments where id = p_establishment_id;

  return p_prefix || '-' || v_short_code || '-' || v_year::text || '-' || lpad(v_number::text, 4, '0');
end;
$$;

-- ---------- 3) Documentar el parche de RLS de recepción (ya vigente en producción) ----------
-- HALLAZGO al auditar los permisos de cocina/bar/servicio para
-- "recibir pedidos": la migración 0002 original dejaba
-- `purchase_orders_all` y `purchase_order_items_all` como políticas
-- ALL restringidas a is_admin_or_buyer(establishment_id) — eso
-- habría bloqueado el SELECT de estas 2 tablas para cualquier rol de
-- área, rompiendo TODA la pantalla de Recepción (getExpectedForOrder,
-- listPurchaseOrders) para cocina, bar Y servicio por igual, no solo
-- para uno de los 3 roles.
--
-- Al inspeccionar las políticas realmente vigentes en producción se
-- confirmó que esto YA fue corregido en algún momento (aplicado
-- directamente en el SQL Editor, sin una migración que lo dejara
-- registrado): hoy existen purchase_orders_select /
-- purchase_order_items_select como políticas de SELECT separadas que
-- usan has_any_role(establishment_id) — cualquier usuario con un rol
-- activo en el establecimiento puede leer, y solo admin/coordinador
-- de compras pueden insertar/actualizar/eliminar (políticas ..._insert
-- / ..._update / ..._delete, con is_admin_or_buyer). Se verificó en
-- vivo impersonando a un usuario real con rol "servicio"
-- (Juliana Tovar): puede leer purchase_orders/purchase_order_items de
-- su propio establecimiento y NO puede leer los del otro
-- establecimiento donde no tiene ningún rol — exactamente el
-- comportamiento esperado.
--
-- Esta sección solo DEJA REGISTRADO en las migraciones lo que ya está
-- vigente (drop + create idempotente, incluye también un `drop policy
-- if exists` de los nombres viejos por si alguna base se restaura
-- desde cero a partir de las migraciones) — no cambia ningún permiso
-- nuevo. El objetivo es cerrar el drift entre las migraciones y la
-- base real, para que un ambiente nuevo (o una restauración desde
-- cero) quede igual de permisivo/restrictivo que producción, y para
-- que este comportamiento no dependa de un cambio manual no
-- versionado.
--
-- PRUEBA: ya verificada en producción vía impersonación SQL (rol
-- servicio, cocina y bar comparten exactamente la misma condición
-- has_any_role, ninguno tiene trato especial); repetir aplicando esta
-- migración sobre una base restaurada desde cero debe dar el mismo
-- resultado.

drop policy if exists purchase_orders_all on purchase_orders;
drop policy if exists purchase_orders_select on purchase_orders;
create policy purchase_orders_select on purchase_orders for select
  using (has_any_role(establishment_id));

drop policy if exists purchase_orders_insert on purchase_orders;
create policy purchase_orders_insert on purchase_orders for insert
  with check (is_admin_or_buyer(establishment_id));

drop policy if exists purchase_orders_update on purchase_orders;
create policy purchase_orders_update on purchase_orders for update
  using (is_admin_or_buyer(establishment_id));

drop policy if exists purchase_orders_delete on purchase_orders;
create policy purchase_orders_delete on purchase_orders for delete
  using (is_admin_or_buyer(establishment_id));

drop policy if exists purchase_order_items_all on purchase_order_items;
drop policy if exists purchase_order_items_select on purchase_order_items;
create policy purchase_order_items_select on purchase_order_items for select
  using (exists (select 1 from purchase_orders po where po.id = purchase_order_items.purchase_order_id
                 and has_any_role(po.establishment_id)));

drop policy if exists purchase_order_items_insert on purchase_order_items;
create policy purchase_order_items_insert on purchase_order_items for insert
  with check (exists (select 1 from purchase_orders po where po.id = purchase_order_items.purchase_order_id
                       and is_admin_or_buyer(po.establishment_id)));

drop policy if exists purchase_order_items_update on purchase_order_items;
create policy purchase_order_items_update on purchase_order_items for update
  using (exists (select 1 from purchase_orders po where po.id = purchase_order_items.purchase_order_id
                 and is_admin_or_buyer(po.establishment_id)));

drop policy if exists purchase_order_items_delete on purchase_order_items;
create policy purchase_order_items_delete on purchase_order_items for delete
  using (exists (select 1 from purchase_orders po where po.id = purchase_order_items.purchase_order_id
                 and is_admin_or_buyer(po.establishment_id)));
