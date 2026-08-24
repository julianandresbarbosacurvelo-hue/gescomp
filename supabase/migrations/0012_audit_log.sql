-- ============================================================
-- GESCOMP — Migración 0012: Auditoría (Fase 16)
-- ============================================================

-- Trigger genérico: registra insert/update/soft_delete con valores anterior y nuevo.
-- SECURITY DEFINER porque `audit_logs` solo tiene política de SELECT para admin — el
-- usuario normal no debe poder insertar filas de auditoría directamente, solo el trigger.
create or replace function trg_audit_log() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
begin
  -- Si no hay usuario autenticado (ej. una migración corrida por el rol de servicio),
  -- no se audita en vez de romper la transacción — la auditoría de negocio ocurre
  -- siempre a través de la app, nunca por SQL directo en producción.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into audit_logs (table_name, record_id, action, new_values, performed_by)
    values (tg_table_name, new.id, 'insert', to_jsonb(new), auth.uid());
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    if (to_jsonb(old) ? 'is_active') and coalesce((old.is_active)::boolean, true) = true
       and coalesce((new.is_active)::boolean, true) = false then
      v_action := 'soft_delete';
    end if;
    insert into audit_logs (table_name, record_id, action, old_values, new_values, performed_by)
    values (tg_table_name, new.id, v_action, to_jsonb(old), to_jsonb(new), auth.uid());
  end if;

  return new;
end;
$$;

-- Se aplica a los maestros y transacciones más sensibles (sección 34 del documento original:
-- creación, modificación, eliminación lógica, cambio de precio/cantidad/proveedor/estado).
-- price_history y status_history ya son en sí mismas tablas de histórico append-only,
-- así que no necesitan este trigger — auditarlas sería duplicar lo que ya conservan.
do $$
declare
  t text;
begin
  foreach t in array array[
    'products','suppliers','categories','subcategories','units','product_suppliers',
    'requisitions','purchase_orders','invoices','user_roles','areas','establishments'
  ]
  loop
    execute format('drop trigger if exists audit_%1$s on %1$s', t);
    execute format('create trigger audit_%1$s after insert or update on %1$s
                     for each row execute function trg_audit_log()', t);
  end loop;
end $$;
