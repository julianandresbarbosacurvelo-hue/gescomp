-- ============================================================
-- GESCOMP — Migración 0017: RLS faltante en status_history
-- (bloqueaba TODA lectura, incluida la del KPI de tiempos del
-- dashboard — Fase 6 habilitó RLS pero nunca agregó política)
-- ============================================================

create policy status_history_select on status_history for select
  using (
    (entity_type = 'purchase_order' and exists (
      select 1 from purchase_orders po where po.id = entity_id and is_admin_or_buyer(po.establishment_id)
    ))
    or (entity_type = 'requisition' and exists (
      select 1 from requisitions r where r.id = entity_id
      and (is_admin_or_buyer(r.establishment_id)
           or user_area_code(r.establishment_id) = (select code from areas where areas.id = r.area_id))
    ))
    or (entity_type = 'delivery' and exists (
      select 1 from deliveries d where d.id = entity_id and has_any_role(d.establishment_id)
    ))
    or (entity_type = 'invoice' and exists (
      select 1 from invoices inv where inv.id = entity_id and is_admin_or_buyer(inv.establishment_id)
    ))
  );
