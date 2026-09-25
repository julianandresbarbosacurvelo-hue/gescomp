-- ============================================================
-- GESCOMP — Migración 0037: versionar los objetos de base de datos
-- que existían en producción sin estar en ninguna migración (deriva)
-- ============================================================
--
-- ANTES: la migración 0035 descubrió, al probar con impersonación real,
-- que la política `status_history_insert` existe en producción pero no
-- en ningún archivo de este repo. Quedó anotado como "vale la pena hacer
-- un pg_dump --schema-only y comparar". Esta migración es exactamente
-- ese ejercicio, hecho y cerrado.
--
-- CÓMO SE HIZO EL DIAGNÓSTICO (evidencia real, no supuesta): se consultó
-- el catálogo de Postgres en producción (pg_policies, pg_class
-- .relrowsecurity, pg_proc, pg_trigger, pg_event_trigger, pg_index,
-- pg_constraint, information_schema.columns) y se cruzó cada objeto
-- contra los `create ...` de las migraciones 0001–0036. Se excluyeron los
-- objetos que pertenecen a extensiones (pg_trgm) o a la plataforma
-- Supabase (event triggers pgrst_*, issue_pg_*_access, etc.). Todos los
-- objetos con deriva que se listan abajo son propiedad del rol
-- `postgres`, es decir, alguien los creó a mano desde el SQL Editor sin
-- dejar la migración correspondiente.
--
-- RESULTADO: 201 columnas, todos los CHECK/UNIQUE, las 2 vistas, los
-- triggers y las funciones propias coinciden con el repo. La deriva son
-- exactamente estos 4 puntos:
--
--   1. Tabla `roles`: tiene RLS habilitado en producción y una política
--      `roles_select` (cualquier usuario autenticado puede leerla). La
--      migración 0022 (SEC-001) habilitó RLS en 9 tablas pero no en
--      `roles`, y ninguna migración creó la política. Reconstruyendo
--      desde cero, `roles` quedaría sin RLS (abierta) — o, si alguien
--      la habilitara sin la política, el login no podría resolver los
--      roles del usuario.
--
--   2. Política `status_history_insert` en `status_history`: la que
--      permite insertar historial para requisition / purchase_order /
--      delivery / invoice, validando cada uno contra su tabla dueña. Sin
--      ella, NINGUNA transición de estado (crear orden, recibir, conciliar,
--      cerrar, cancelar) puede registrar historial para un usuario real —
--      solo funciona hoy porque existe en producción. La migración 0035
--      agregó una política aparte para 'requisition_item'; ambas se
--      combinan con OR y no se tocan entre sí.
--
--   3. Índice único parcial
--      `product_suppliers_one_preferred_per_product_establishment`:
--      garantiza que un producto tenga UN solo proveedor habitual
--      (is_preferred = true) por establecimiento. Es la regla de negocio
--      sobre la que se apoya `v_pedidos_por_proveedor` (0005/0027): si
--      hubiera dos preferidos, el mismo ítem aparecería duplicado bajo
--      dos proveedores. Hoy esa garantía solo existe en producción.
--
--   4. Función `rls_auto_enable()` + event trigger `ensure_rls`: cada vez
--      que se crea una tabla nueva en `public`, le activa RLS
--      automáticamente. Es una salvaguarda contra volver a caer en el
--      hallazgo SEC-001 de la auditoría (tablas con políticas escritas
--      pero RLS nunca habilitado). Alguien la puso después de esa
--      auditoría, con buen criterio, pero sin versionarla.
--
-- CAMBIO: se versionan los 4 puntos tal cual existen en producción, con
-- la definición EXACTA extraída del catálogo (pg_get_expr /
-- pg_get_functiondef / pg_get_indexdef), sin cambiar ninguna regla.
-- Todo está escrito de forma idempotente, para que esta misma migración
-- sirva en los dos escenarios:
--   - Sobre producción (donde los objetos YA existen): las políticas se
--     recrean idénticas (drop + create dentro de la misma transacción),
--     el índice y el enable RLS no hacen nada porque ya están, y el event
--     trigger se recrea igual.
--   - Sobre una base nueva desde cero: crea todo.
--
-- IMPACTO: cero cambio funcional. Se verificó antes y después con una
-- huella md5 de la definición de cada política (USING + WITH CHECK +
-- comando + permissive): idénticas. El `drop policy` + `create policy`
-- corre en una sola transacción, así que no hay ninguna ventana en la que
-- la política no exista.
--
-- PRUEBA:
--   - `select polname, md5(...)` sobre roles_select / status_history_insert
--     debe dar la misma huella que antes de aplicar:
--       roles_select:          5a047c6f1a3aed76f54df4bc46ac553d
--       status_history_insert: 2bb8d13bd83ff6cfd7f0afe63fa5ee38
--   - `select relrowsecurity from pg_class where relname = 'roles'` → true.
--   - `select count(*) from pg_event_trigger where evtname = 'ensure_rls'` → 1.
--   - `insert into product_suppliers (...) values (<producto que ya tiene
--     preferido>, <otro proveedor>, <mismo establecimiento>, true)` debe
--     fallar por el índice único.
--   - Flujo real: generar una orden de compra como coordinador de compras
--     debe seguir funcionando (eso ejercita status_history_insert con
--     entity_type = 'purchase_order').

-- ------------------------------------------------------------
-- 1. roles: RLS + política de lectura
-- ------------------------------------------------------------
alter table roles enable row level security;

drop policy if exists roles_select on roles;
create policy roles_select on roles
  for select
  using (auth.uid() is not null);

-- ------------------------------------------------------------
-- 2. status_history: política de INSERT para los 4 tipos originales
-- ------------------------------------------------------------
drop policy if exists status_history_insert on status_history;
create policy status_history_insert on status_history
  for insert
  with check (
    changed_by = auth.uid()
    and (
      (
        entity_type = 'requisition'
        and exists (
          select 1 from requisitions r
          where r.id = status_history.entity_id
            and (
              is_admin_or_buyer(r.establishment_id)
              or user_area_code(r.establishment_id) = (select areas.code from areas where areas.id = r.area_id)
            )
        )
      )
      or (
        entity_type = 'purchase_order'
        and exists (
          select 1 from purchase_orders po
          where po.id = status_history.entity_id
            and has_any_role(po.establishment_id)
        )
      )
      or (
        entity_type = 'delivery'
        and exists (
          select 1 from deliveries d
          where d.id = status_history.entity_id
            and has_any_role(d.establishment_id)
        )
      )
      or (
        entity_type = 'invoice'
        and exists (
          select 1 from invoices inv
          where inv.id = status_history.entity_id
            and is_admin_or_buyer(inv.establishment_id)
        )
      )
    )
  );

-- ------------------------------------------------------------
-- 3. product_suppliers: un solo proveedor habitual por producto y
--    establecimiento
-- ------------------------------------------------------------
create unique index if not exists product_suppliers_one_preferred_per_product_establishment
  on product_suppliers (product_id, establishment_id)
  where is_preferred = true;

-- ------------------------------------------------------------
-- 4. Salvaguarda: RLS automático en tablas nuevas de public
-- ------------------------------------------------------------
create or replace function rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name in ('public')
       and cmd.schema_name not in ('pg_catalog', 'information_schema')
       and cmd.schema_name not like 'pg_toast%'
       and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$function$;

-- `create event trigger` no admite "if not exists"; se hace en un bloque
-- para que sea idempotente. Si el entorno no permitiera crear event
-- triggers (requiere privilegios elevados; en Supabase el rol postgres
-- sí puede), se avisa con un notice en vez de tumbar toda la migración —
-- es una salvaguarda, no una pieza de la que dependa el negocio.
do $$
begin
  if exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    execute 'drop event trigger ensure_rls';
  end if;
  execute $et$
    create event trigger ensure_rls
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function rls_auto_enable()
  $et$;
exception
  when insufficient_privilege then
    raise notice 'No se pudo crear el event trigger ensure_rls (privilegios insuficientes). Crearlo manualmente con un rol con permisos.';
end $$;
