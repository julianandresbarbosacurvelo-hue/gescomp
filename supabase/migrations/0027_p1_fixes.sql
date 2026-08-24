-- ============================================================
-- GESCOMP — Migración 0027: Corrección P1
-- (RLS-P1-001, UNIT-P1-001, SOFT-DELETE-P1-001)
-- ============================================================

-- ---------- RLS-P1-001: code_counters quedó bloqueada por SEC-001 ----------
-- ANTES: sin ninguna política, tras habilitar RLS en la 0022 quedó
-- completamente cerrada — ni siquiera next_code() (security invoker)
-- podía usarla, lo que habría roto la creación de requerimientos Y de
-- órdenes para todos los roles.
-- CAMBIO: cualquier usuario con un rol activo en el establecimiento
-- puede leer/escribir su contador — es información de bajo riesgo (un
-- número secuencial, no datos de negocio) y la necesitan tanto roles
-- de área (para requerimientos) como compras (para órdenes).
-- PRUEBA: crear un requerimiento (rol cocina) y una orden (rol
-- coordinador_compras) en el mismo establecimiento → ambos códigos
-- deben seguir generándose sin error, consecutivos y sin colisión.
create policy code_counters_all on code_counters for all
  using (has_any_role(establishment_id))
  with check (has_any_role(establishment_id));

-- ---------- UNIT-P1-001: validar que la unidad transaccional coincida con la del producto ----------
-- ANTES: requisition_items.unit_id y purchase_order_items.unit_id se
-- guardaban sin comparar contra products.unit_id — nada impedía
-- capturar "Tomate" en "unidades" cuando el maestro dice "kg".
-- CAMBIO: trigger que valida, solo cuando product_id no es null, que
-- el unit_id coincida con el unit_id del producto. No aplica a
-- productos no registrados (no tienen product_id, por diseño desde
-- la Fase 1 del backend).
-- IMPACTO: cualquier intento de guardar una unidad distinta a la del
-- maestro del producto empieza a fallar — si en la práctica hay casos
-- legítimos de "unidad de compra distinta a la de consumo", esto NO
-- los soporta (esa distinción quedó fuera de alcance desde la decisión
-- explícita de la Fase 2: "solo unidad de compra, sin conversión").
-- PRUEBA: crear un requerimiento normal (mismo unit_id que el
-- producto) → funciona igual. Intentar forzar un unit_id distinto
-- (vía llamada directa al RPC) → debe fallar con excepción clara.
create or replace function trg_validate_unit_matches_product() returns trigger
language plpgsql as $$
declare
  v_product_unit_id uuid;
begin
  if new.product_id is not null then
    select unit_id into v_product_unit_id from products where id = new.product_id;
    if v_product_unit_id is not null and v_product_unit_id <> new.unit_id then
      raise exception 'La unidad no coincide con la unidad de compra definida para este producto';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_unit_requisition_items on requisition_items;
create trigger validate_unit_requisition_items
  before insert or update on requisition_items
  for each row execute function trg_validate_unit_matches_product();

drop trigger if exists validate_unit_purchase_order_items on purchase_order_items;
create trigger validate_unit_purchase_order_items
  before insert or update on purchase_order_items
  for each row execute function trg_validate_unit_matches_product();

-- ---------- SOFT-DELETE-P1-001: proveedor inactivo seguía apareciendo en Pedidos por Proveedor ----------
-- ANTES: v_pedidos_por_proveedor no filtraba por suppliers.is_active —
-- un proveedor desactivado seguía recibiendo pedidos nuevos.
-- CAMBIO: se agrega el join/filtro contra suppliers.is_active. Los
-- productos de un proveedor desactivado caen automáticamente al grupo
-- "sin proveedor" (mismo comportamiento que si nunca hubiera tenido
-- proveedor habitual), en vez de desaparecer silenciosamente.
-- PRUEBA: desactivar un proveedor con productos habituales asignados →
-- esos productos deben pasar a "sin proveedor" en la pantalla, no
-- desaparecer ni seguir agrupados bajo el proveedor inactivo.
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
  and ps.is_preferred = true
left join suppliers s on s.id = ps.supplier_id and s.is_active = true
where ps.supplier_id is null or s.id is not null;
