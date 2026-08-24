-- ============================================================
-- GESCOMP — Migración 0015: RLS faltante para administración
-- de usuarios (detectado en la auditoría de frontend)
-- ============================================================

-- La Fase 7 solo dejó SELECT en `users` (propio + admin). Falta UPDATE (para
-- desactivar un usuario) y una política de INSERT no es necesaria porque la
-- creación de la fila `users` se hace con el cliente admin (service role,
-- bypassa RLS) desde `createUserWithRole` — nunca desde el cliente del navegador.

create policy users_admin_update on users for update
  using (
    exists (
      select 1 from user_roles ur_target
      join user_roles ur_admin on ur_admin.establishment_id = ur_target.establishment_id
      join roles r on r.id = ur_admin.role_id
      where ur_target.user_id = users.id
        and ur_admin.user_id = auth.uid()
        and r.code = 'admin'
    )
  );
