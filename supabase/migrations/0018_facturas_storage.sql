-- ============================================================
-- GESCOMP — Migración 0018: bucket de Storage para facturas
-- (Etapa Frontend 10 — faltaba, igual que ordenes-pdf/evidencias-recepcion)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', true)
on conflict (id) do nothing;

-- Solo admin/coordinador_compras registra facturas (ya es la regla de negocio real:
-- RLS de la tabla `invoices` ya lo exige, esto solo alinea el bucket con lo mismo).
create policy facturas_upload on storage.objects for insert
  with check (
    bucket_id = 'facturas'
    and exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = auth.uid() and r.code in ('admin','coordinador_compras'))
  );
create policy facturas_read on storage.objects for select
  using (bucket_id = 'facturas');
