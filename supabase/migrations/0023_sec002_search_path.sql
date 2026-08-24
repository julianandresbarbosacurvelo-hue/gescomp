-- ============================================================
-- GESCOMP — Migración 0023: SEC-002 (P0)
--
-- ANTES: has_role, has_any_role, is_admin_or_buyer y user_area_code
-- son SECURITY DEFINER (necesario, correcto) pero ninguna fijaba
-- `search_path` — el patrón que Supabase marca como "Function Search
-- Path Mutable". Como estas 4 funciones son la base de TODA política
-- RLS del sistema, es la corrección de mayor apalancamiento de la
-- auditoría.
--
-- CAMBIO: se agrega `set search_path = public` a las 4, sin tocar su
-- lógica interna. `create or replace function` conserva la definición
-- SQL exacta, solo se le agrega la cláusula `set`.
--
-- IMPACTO: ninguno funcional esperado — estas funciones ya calificaban
-- todas sus referencias de tabla contra el esquema `public` de forma
-- implícita (es donde vive todo Gescomp), así que fijar el search_path
-- a `public` no cambia a qué tablas apuntan. Es un endurecimiento de
-- seguridad puro, no un cambio de comportamiento.
--
-- PRUEBA: tras aplicar, correr el linter de seguridad de Supabase
-- (Database → Advisors → Security) y confirmar que la advertencia
-- "Function Search Path Mutable" ya no aparece para estas 4 funciones.
-- Adicionalmente, repetir cualquier flujo normal (crear requerimiento,
-- generar orden, recibir) y confirmar que sigue funcionando idéntico —
-- si algo se rompiera aquí, sería la señal de que alguna referencia
-- interna dependía implícitamente de otro search_path, lo cual no
-- debería ser el caso.
-- ============================================================

create or replace function has_role(p_role_code text, p_establishment_id uuid)
returns boolean
language sql stable security definer
set search_path = public
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

create or replace function has_any_role(p_establishment_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid() and ur.establishment_id = p_establishment_id
  );
$$;

create or replace function is_admin_or_buyer(p_establishment_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select has_role('admin', p_establishment_id) or has_role('coordinador_compras', p_establishment_id);
$$;

create or replace function user_area_code(p_establishment_id uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select r.code
  from user_roles ur
  join roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
    and ur.establishment_id = p_establishment_id
    and r.code in ('cocina','bar','servicio')
  limit 1;
$$;
