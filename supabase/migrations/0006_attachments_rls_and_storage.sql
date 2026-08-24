-- ============================================================
-- GESCOMP — Migración 0006: RLS de attachments + bucket de storage
-- (complementa la Fase 7, que dejó esta tabla sin política)
-- ============================================================

-- Lectura/escritura de adjuntos: solo quien ya tiene acceso a la entidad dueña del adjunto.
-- Para purchase_order es admin/coordinador_compras; para delivery, cualquier rol del establecimiento.
create policy attachments_po_select on attachments for select
  using (
    entity_type = 'purchase_order'
    and exists (select 1 from purchase_orders po where po.id = entity_id and is_admin_or_buyer(po.establishment_id))
  );
create policy attachments_po_write on attachments for all
  using (
    entity_type = 'purchase_order'
    and exists (select 1 from purchase_orders po where po.id = entity_id and is_admin_or_buyer(po.establishment_id))
  )
  with check (
    entity_type = 'purchase_order'
    and exists (select 1 from purchase_orders po where po.id = entity_id and is_admin_or_buyer(po.establishment_id))
  );

create policy attachments_delivery_select on attachments for select
  using (
    entity_type = 'delivery'
    and exists (select 1 from deliveries d where d.id = entity_id and has_any_role(d.establishment_id))
  );
create policy attachments_delivery_write on attachments for all
  using (
    entity_type = 'delivery'
    and exists (select 1 from deliveries d where d.id = entity_id and d.received_by = auth.uid())
  );

create policy attachments_invoice_select on attachments for select
  using (
    entity_type = 'invoice'
    and exists (select 1 from invoices inv where inv.id = entity_id and is_admin_or_buyer(inv.establishment_id))
  );
create policy attachments_invoice_write on attachments for all
  using (
    entity_type = 'invoice'
    and exists (select 1 from invoices inv where inv.id = entity_id and is_admin_or_buyer(inv.establishment_id))
  );

alter table attachments enable row level security;

-- ---------- Bucket de Storage para los PDF de órdenes ----------
-- Ejecutar una sola vez (o vía dashboard de Supabase: Storage → New Bucket → "ordenes-pdf", público de lectura).
insert into storage.buckets (id, name, public)
values ('ordenes-pdf', 'ordenes-pdf', true)
on conflict (id) do nothing;

-- Solo admin/coordinador_compras puede subir; lectura pública porque el PDF se comparte
-- por WhatsApp/e-mail fuera del sistema (no requiere sesión para abrirse).
create policy ordenes_pdf_upload on storage.objects for insert
  with check (
    bucket_id = 'ordenes-pdf'
    and exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = auth.uid() and r.code in ('admin','coordinador_compras'))
  );
create policy ordenes_pdf_read on storage.objects for select
  using (bucket_id = 'ordenes-pdf');
