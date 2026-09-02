-- ============================================================
-- GESCOMP — Migración 0028: RLS de requerimientos rota para
-- usuarios con más de un rol de área en el mismo establecimiento
-- ============================================================

-- ANTES: user_area_code(establishment_id) devuelve, con `limit 1` y sin
-- `order by`, UN SOLO código de rol de área (cocina/bar/servicio) para el
-- usuario en ese establecimiento — asumiendo implícitamente que cada
-- usuario tiene como máximo un rol de área por establecimiento. Eso dejó
-- de ser cierto con los usuarios reales: Adrian Barrera (adriannbarr25@
-- gmail.com) tiene TANTO "cocina" COMO "bar" en Restaurante Cielo y Sazón.
-- Cuando ese usuario arma un requerimiento desde el área "bar", el cliente
-- elige correctamente el area_id de "bar", pero la política RLS
-- requisitions_insert compara ese area.code contra user_area_code(...),
-- que puede devolver "cocina" en su lugar (el orden de `limit 1` sin
-- `order by` no está garantizado) → el insert es rechazado con "new row
-- violates row-level security policy for table requisitions", aunque el
-- usuario sí tiene un rol legítimo para esa área. El mismo problema latente
-- afecta requisitions_select, requisitions_update_own_area y
-- status_history_select (todas usan user_area_code de la misma forma).
--
-- CAMBIO: se agrega user_has_area_role(establishment_id, area_code), que
-- devuelve un booleano vía EXISTS — responde "¿el usuario tiene ALGÚN rol
-- que coincida con este código de área específico?" en vez de "¿cuál es
-- EL código de área del usuario?". Esto es correcto sin importar cuántos
-- roles de área tenga la persona en ese establecimiento. Se reemplaza el
-- uso de user_area_code(...) = area.code por user_has_area_role(...) en
-- las 4 políticas afectadas. user_area_code() se deja intacta (no se
-- usa desde la aplicación, solo internamente en SQL) por si alguna otra
-- función llegara a depender de su valor puntual, pero deja de usarse en
-- estas comparaciones de pertenencia.
--
-- IMPACTO: ningún flujo existente para usuarios con un solo rol de área
-- cambia (user_has_area_role es equivalente a la comparación anterior en
-- ese caso). Para usuarios con más de un rol de área en el mismo
-- establecimiento, ahora pueden crear, ver y actualizar requerimientos de
-- CUALQUIERA de sus áreas, no solo de la que el `limit 1` haya devuelto.
--
-- PRUEBA: con un usuario que tenga roles "cocina" Y "bar" en el mismo
-- establecimiento (ej. Adrian Barrera): crear un requerimiento desde
-- "bar" → debe guardarse sin error de RLS; crear uno desde "cocina" →
-- también debe funcionar; "Mis Requerimientos" debe listar los de ambas
-- áreas. Repetir con un usuario de un solo rol de área → debe comportarse
-- exactamente igual que antes.

create or replace function user_has_area_role(p_establishment_id uuid, p_area_code text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.establishment_id = p_establishment_id
      and r.code = p_area_code
  );
$$;

drop policy if exists requisitions_select on requisitions;
create policy requisitions_select on requisitions for select
  using (
    is_admin_or_buyer(establishment_id)
    or exists (
      select 1 from areas a
      where a.id = requisitions.area_id
        and a.establishment_id = requisitions.establishment_id
        and user_has_area_role(requisitions.establishment_id, a.code)
    )
  );

drop policy if exists requisitions_insert on requisitions;
create policy requisitions_insert on requisitions for insert
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from areas a
      where a.id = requisitions.area_id
        and a.establishment_id = requisitions.establishment_id
        and user_has_area_role(requisitions.establishment_id, a.code)
    )
  );

drop policy if exists requisitions_update_own_area on requisitions;
create policy requisitions_update_own_area on requisitions for update
  using (
    status = 'enviado'
    and exists (
      select 1 from areas a
      where a.id = requisitions.area_id
        and a.establishment_id = requisitions.establishment_id
        and user_has_area_role(requisitions.establishment_id, a.code)
    )
  );

drop policy if exists status_history_select on status_history;
create policy status_history_select on status_history for select
  using (
    (entity_type = 'purchase_order' and exists (
      select 1 from purchase_orders po where po.id = entity_id and is_admin_or_buyer(po.establishment_id)
    ))
    or (entity_type = 'requisition' and exists (
      select 1 from requisitions r where r.id = entity_id
      and (is_admin_or_buyer(r.establishment_id)
           or user_has_area_role(r.establishment_id, (select code from areas where areas.id = r.area_id)))
    ))
    or (entity_type = 'delivery' and exists (
      select 1 from deliveries d where d.id = entity_id and has_any_role(d.establishment_id)
    ))
    or (entity_type = 'invoice' and exists (
      select 1 from invoices inv where inv.id = entity_id and is_admin_or_buyer(inv.establishment_id)
    ))
  );
