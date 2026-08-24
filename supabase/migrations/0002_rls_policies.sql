-- ============================================================
-- GESCOMP — Migración 0002: Autenticación y roles (RLS)
-- ============================================================

-- ---------- Funciones helper (se ejecutan con permisos del usuario autenticado) ----------

-- ¿El usuario actual tiene el rol indicado en ese establecimiento?
create or replace function has_role(p_role_code text, p_establishment_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.code = p_role_code
      and ur.establishment_id = p_establishment_id
  );
$$;

-- ¿El usuario actual tiene CUALQUIER rol en ese establecimiento? (para catálogos de solo lectura)
create or replace function has_any_role(p_establishment_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid() and ur.establishment_id = p_establishment_id
  );
$$;

-- ¿El usuario actual es admin o coordinador_compras en ese establecimiento?
create or replace function is_admin_or_buyer(p_establishment_id uuid)
returns boolean
language sql stable security definer
as $$
  select has_role('admin', p_establishment_id) or has_role('coordinador_compras', p_establishment_id);
$$;

-- Código de área que le corresponde al rol de área del usuario (cocina/bar/servicio) en ese establecimiento,
-- o null si no tiene rol de área ahí.
create or replace function user_area_code(p_establishment_id uuid)
returns text
language sql stable security definer
as $$
  select r.code
  from user_roles ur
  join roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
    and ur.establishment_id = p_establishment_id
    and r.code in ('cocina','bar','servicio')
  limit 1;
$$;

-- ---------- establishments ----------
create policy establishments_select on establishments for select
  using (has_any_role(id));
create policy establishments_admin_write on establishments for all
  using (has_role('admin', id)) with check (has_role('admin', id));

-- ---------- users / user_roles (administración, Fase 9 de tu doc original) ----------
create policy users_self_select on users for select
  using (id = auth.uid());
create policy users_admin_select on users for select
  using (exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                 where ur.user_id = auth.uid() and r.code = 'admin'));
create policy user_roles_admin_manage on user_roles for all
  using (has_role('admin', establishment_id)) with check (has_role('admin', establishment_id));
create policy user_roles_self_select on user_roles for select
  using (user_id = auth.uid());

-- ---------- areas ----------
create policy areas_select on areas for select
  using (has_any_role(establishment_id));
create policy areas_admin_write on areas for all
  using (has_role('admin', establishment_id)) with check (has_role('admin', establishment_id));

-- ---------- catálogos compartidos: categories, subcategories, units ----------
-- Lectura abierta a cualquier usuario autenticado con al menos un rol en algún establecimiento
-- (son catálogos globales, no tienen establishment_id).
create policy categories_select on categories for select using (auth.uid() is not null);
create policy categories_write on categories for all
  using (exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                 where ur.user_id = auth.uid() and r.code in ('admin','coordinador_compras')))
  with check (exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                 where ur.user_id = auth.uid() and r.code in ('admin','coordinador_compras')));
create policy subcategories_select on subcategories for select using (auth.uid() is not null);
create policy subcategories_write on subcategories for all
  using (exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                 where ur.user_id = auth.uid() and r.code in ('admin','coordinador_compras')))
  with check (true);
create policy units_select on units for select using (auth.uid() is not null);
create policy units_write on units for all
  using (exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                 where ur.user_id = auth.uid() and r.code in ('admin','coordinador_compras')));

-- ---------- products / suppliers / product_suppliers ----------
create policy products_select on products for select using (auth.uid() is not null);
create policy products_write on products for all
  using (exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                 where ur.user_id = auth.uid() and r.code in ('admin','coordinador_compras')));

create policy suppliers_select on suppliers for select using (auth.uid() is not null);
create policy suppliers_write on suppliers for all
  using (exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                 where ur.user_id = auth.uid() and r.code in ('admin','coordinador_compras')));

create policy product_suppliers_select on product_suppliers for select
  using (has_any_role(establishment_id));
create policy product_suppliers_write on product_suppliers for all
  using (is_admin_or_buyer(establishment_id)) with check (is_admin_or_buyer(establishment_id));

-- ---------- requisitions ----------
create policy requisitions_select on requisitions for select
  using (
    is_admin_or_buyer(establishment_id)
    or user_area_code(establishment_id) = (select code from areas where areas.id = requisitions.area_id)
  );
create policy requisitions_insert on requisitions for insert
  with check (
    requested_by = auth.uid()
    and user_area_code(establishment_id) = (select code from areas where areas.id = requisitions.area_id)
  );
create policy requisitions_update_own_area on requisitions for update
  using (
    status = 'enviado'
    and user_area_code(establishment_id) = (select code from areas where areas.id = requisitions.area_id)
  );
create policy requisitions_update_buyer on requisitions for update
  using (is_admin_or_buyer(establishment_id));

create policy requisition_items_select on requisition_items for select
  using (exists (select 1 from requisitions req where req.id = requisition_id
                 and (is_admin_or_buyer(req.establishment_id)
                      or user_area_code(req.establishment_id) = (select code from areas where areas.id = req.area_id))));
create policy requisition_items_insert on requisition_items for insert
  with check (exists (select 1 from requisitions req where req.id = requisition_id
                 and req.requested_by = auth.uid() and req.status = 'enviado'));
create policy requisition_items_buyer_update on requisition_items for update
  using (exists (select 1 from requisitions req where req.id = requisition_id
                 and is_admin_or_buyer(req.establishment_id)));

-- ---------- purchase_orders / items / sources (solo compras) ----------
create policy purchase_orders_all on purchase_orders for all
  using (is_admin_or_buyer(establishment_id)) with check (is_admin_or_buyer(establishment_id));

create policy purchase_order_items_all on purchase_order_items for all
  using (exists (select 1 from purchase_orders po where po.id = purchase_order_id
                 and is_admin_or_buyer(po.establishment_id)));

create policy purchase_order_item_sources_all on purchase_order_item_sources for all
  using (exists (select 1 from purchase_order_items poi join purchase_orders po on po.id = poi.purchase_order_id
                 where poi.id = purchase_order_item_id and is_admin_or_buyer(po.establishment_id)));

-- ---------- deliveries / delivery_items ----------
-- Supuesto (a confirmar): cualquier usuario con rol activo en el establecimiento puede recibir,
-- no solo el coordinador — porque la recepción ocurre en el andén, no en oficina.
create policy deliveries_select on deliveries for select
  using (has_any_role(establishment_id));
create policy deliveries_insert on deliveries for insert
  with check (received_by = auth.uid() and has_any_role(establishment_id));
create policy delivery_items_select on delivery_items for select
  using (exists (select 1 from deliveries d where d.id = delivery_id and has_any_role(d.establishment_id)));
create policy delivery_items_insert on delivery_items for insert
  with check (exists (select 1 from deliveries d where d.id = delivery_id
                       and d.received_by = auth.uid() and has_any_role(d.establishment_id)));

-- ---------- invoices / invoice_items (conciliación: solo compras) ----------
create policy invoices_all on invoices for all
  using (is_admin_or_buyer(establishment_id)) with check (is_admin_or_buyer(establishment_id));
create policy invoice_items_all on invoice_items for all
  using (exists (select 1 from invoices inv where inv.id = invoice_id and is_admin_or_buyer(inv.establishment_id)));

-- ---------- price_history ----------
-- Lectura: solo compras/admin (es información sensible de negociación).
-- Escritura: se hace vía Server Action con service role (nunca directo desde el cliente),
-- por eso no se abre INSERT a roles de área aquí aunque el receptor capture el precio en la UI.
create policy price_history_select on price_history for select
  using (is_admin_or_buyer(establishment_id));

-- ---------- alerts / audit_logs ----------
create policy alerts_select on alerts for select
  using (is_admin_or_buyer(establishment_id));
create policy audit_logs_select on audit_logs for select
  using (exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                 where ur.user_id = auth.uid() and r.code = 'admin'));
