-- ============================================================
-- GESCOMP — Migración 0029: falta política de UPDATE en storage.objects
-- para el bucket ordenes-pdf, rompe la re-generación de PDF de órdenes
-- ============================================================
--
-- ANTES: generateAndAttachOrderPdf() sube el PDF con
-- `supabase.storage.from('ordenes-pdf').upload(filePath, pdfBytes,
-- { upsert: true })`, donde filePath es `${order.code}.pdf` (ej.
-- "OC-BOG-0001.pdf"). La migración 0006 solo creó una política de
-- INSERT (ordenes_pdf_upload) para ese bucket — nunca una de UPDATE.
-- Mientras el nombre de archivo no existiera aún en el bucket, el
-- upsert hacía un INSERT normal y la política de INSERT alcanzaba;
-- pero en cuanto YA EXISTE un objeto con ese mismo nombre, Storage
-- hace un UPDATE sobre esa fila de storage.objects — y como no hay
-- ninguna política que autorice UPDATE en esa tabla para este bucket,
-- PostgREST/Storage la rechaza con "new row violates row-level
-- security policy", sin importar el rol del usuario.
--
-- Esto pasó a producción cuando purchase_orders (y su contador de
-- códigos) se reinició pero el bucket de Storage NO — las primeras
-- órdenes nuevas volvieron a generar los códigos OC-BOG-0001 y
-- OC-BOG-0002, que ya existían como archivos en ordenes-pdf desde
-- las órdenes de prueba de fines de agosto. El insert en `attachments`
-- y el insert en `purchase_orders` (creación de la orden) funcionan
-- bien — el único paso que falla es la subida a Storage cuando el
-- nombre colisiona, y ese fallo se traga en un try/catch silencioso
-- (createPurchaseOrder solo hace console.error), por lo que nunca
-- llegó a verse en la UI ni se generaron ni el archivo ni el registro
-- en `attachments`.
--
-- CAMBIO: se agrega ordenes_pdf_update, una política de UPDATE sobre
-- storage.objects para bucket_id = 'ordenes-pdf' con la misma
-- condición de rol que ya usa ordenes_pdf_upload (admin o
-- coordinador_compras). Se agrega tanto USING como WITH CHECK porque
-- UPDATE evalúa la fila vieja (USING) y la nueva (WITH CHECK).
--
-- IMPACTO: generar el PDF de una orden por primera vez sigue
-- funcionando igual (sigue siendo un INSERT). Volver a generarlo para
-- una orden cuyo código coincide con un archivo preexistente en el
-- bucket (como ocurrió aquí, o al usar el nuevo botón "Generar PDF"
-- manual) ahora sí puede sobreescribirlo. No se toca ninguna otra
-- tabla ni bucket.
--
-- PRUEBA: con un usuario admin/coordinador_compras, desde "Detalle de
-- Orden" de OC-BOG-0001 o OC-BOG-0002 (las dos órdenes reales creadas
-- hoy, cuyo pdf_attachment_id sigue en NULL), usar el botón
-- "Generar PDF" → debe completarse sin error, aparecer el enlace
-- "Ver orden formal (PDF)", y el archivo en el bucket ordenes-pdf
-- debe quedar con el PDF real de esa orden (no el de prueba de
-- agosto). Repetir creando una orden nueva con un código que no
-- exista aún en el bucket → debe seguir funcionando igual que antes
-- (sigue siendo un INSERT normal).
-- ============================================================

create policy ordenes_pdf_update on storage.objects for update
  using (
    bucket_id = 'ordenes-pdf'
    and exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = auth.uid() and r.code in ('admin','coordinador_compras'))
  )
  with check (
    bucket_id = 'ordenes-pdf'
    and exists (select 1 from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = auth.uid() and r.code in ('admin','coordinador_compras'))
  );
