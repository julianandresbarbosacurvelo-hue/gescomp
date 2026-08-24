-- ============================================================
-- GESCOMP — Migración 0024: DATA-001 (P0)
--
-- ANTES: create_requisition_with_items nunca validaba que p_area_id
-- perteneciera a p_establishment_id. La política RLS requisitions_insert
-- comparaba solo el CÓDIGO del área ('cocina') contra el rol del
-- usuario, sin comparar el establecimiento del área contra el de la
-- requisición — dos sedes con área "cocina" (mismo código, distinto
-- id y establishment_id) podían mezclarse.
--
-- CAMBIO: dos capas de defensa, independientes entre sí:
--   1. Dentro de la función (defensa en profundidad, no depende solo
--      de RLS): se valida explícitamente `areas.establishment_id =
--      p_establishment_id` antes de insertar, con excepción clara si
--      no coincide.
--   2. Se corrigen las políticas RLS de `requisitions`
--      (select/insert/update) para exigir que el área referenciada
--      tenga el MISMO establishment_id que la requisición, además de
--      que el código coincida con el rol del usuario.
--
-- IMPACTO: ningún flujo legítimo cambia — un área siempre pertenece a
-- un solo establecimiento por diseño (`areas.establishment_id` es
-- NOT NULL y así se sembraron los datos de demo). El único caso que
-- deja de funcionar es exactamente el que debía dejar de funcionar:
-- mezclar area_id de una sede con establishment_id de otra.
--
-- PRUEBA:
--   1. Flujo normal: crear un requerimiento desde un usuario `cocina`
--      de Sede Bogotá, con su área real de Bogotá → debe seguir
--      funcionando idéntico.
--   2. Ataque simulado: llamar al RPC `create_requisition_with_items`
--      directamente (vía SQL Editor con una sesión de prueba, o
--      Postman contra el endpoint RPC) pasando el `establishment_id`
--      de Bogotá pero el `area_id` de Medellín → debe fallar con la
--      excepción explícita "El área no pertenece a este
--      establecimiento", no insertar nada.
-- ============================================================

create or replace function create_requisition_with_items(
  p_establishment_id uuid,
  p_area_id uuid,
  p_required_date date,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_requisition_id uuid;
  v_code text;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_avg_qty numeric;
  v_last_date date;
  v_avg_days numeric;
  v_days_since_last numeric;
  v_area_belongs boolean;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Un requerimiento debe tener al menos un ítem';
  end if;

  -- DATA-001: el área debe pertenecer realmente a este establecimiento,
  -- no solo tener el código correcto.
  select exists (
    select 1 from areas where id = p_area_id and establishment_id = p_establishment_id
  ) into v_area_belongs;

  if not v_area_belongs then
    raise exception 'El área no pertenece a este establecimiento';
  end if;

  v_code := next_code(p_establishment_id, 'requisition', 'REQ');

  insert into requisitions (code, establishment_id, area_id, requested_by, status, required_date, notes)
  values (v_code, p_establishment_id, p_area_id, auth.uid(), 'enviado', p_required_date, p_notes)
  returning id into v_requisition_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_qty := (v_item->>'quantity')::numeric;

    insert into requisition_items (
      requisition_id, product_id, unregistered_product_name, quantity, unit_id, priority, notes
    ) values (
      v_requisition_id, v_product_id, nullif(v_item->>'unregistered_product_name',''),
      v_qty, (v_item->>'unit_id')::uuid, nullif(v_item->>'priority',''), nullif(v_item->>'notes','')
    );

    if v_product_id is not null then
      select avg(ri.quantity) into v_avg_qty
      from requisition_items ri
      join requisitions r on r.id = ri.requisition_id
      where ri.product_id = v_product_id and r.establishment_id = p_establishment_id and r.id <> v_requisition_id;

      if v_avg_qty is not null and v_avg_qty > 0 and v_qty > v_avg_qty * 1.5 then
        insert into alerts (type, establishment_id, entity_type, entity_id, severity, message)
        values ('cantidad_anormal', p_establishment_id, 'requisition_item', v_requisition_id, 'advertencia',
          format('Cantidad %s%% superior al promedio histórico (%s vs. %s)',
                 round(((v_qty - v_avg_qty) / v_avg_qty) * 100), v_qty, round(v_avg_qty, 1)));
      end if;

      select max(r.created_at::date) into v_last_date
      from requisition_items ri join requisitions r on r.id = ri.requisition_id
      where ri.product_id = v_product_id and r.establishment_id = p_establishment_id and r.id <> v_requisition_id;

      if v_last_date is not null then
        v_days_since_last := current_date - v_last_date;

        select avg(dias) into v_avg_days
        from (
          select r.created_at::date - lag(r.created_at::date) over (order by r.created_at) as dias
          from requisition_items ri join requisitions r on r.id = ri.requisition_id
          where ri.product_id = v_product_id and r.establishment_id = p_establishment_id
        ) d where dias is not null;

        if v_avg_days is not null and v_avg_days > 2 and v_days_since_last < v_avg_days * 0.4 then
          insert into alerts (type, establishment_id, entity_type, entity_id, severity, message)
          values ('frecuencia_anormal', p_establishment_id, 'requisition_item', v_requisition_id, 'info',
            format('Se solicita de nuevo tras %s días (habitual: %s días)', v_days_since_last, round(v_avg_days, 1)));
        end if;
      end if;
    end if;
  end loop;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by)
  values ('requisition', v_requisition_id, null, 'enviado', auth.uid());

  return v_requisition_id;
end;
$$;

-- ---------- Corrección de las políticas RLS de requisitions ----------

drop policy if exists requisitions_select on requisitions;
create policy requisitions_select on requisitions for select
  using (
    is_admin_or_buyer(establishment_id)
    or exists (
      select 1 from areas a
      where a.id = requisitions.area_id
        and a.establishment_id = requisitions.establishment_id
        and a.code = user_area_code(requisitions.establishment_id)
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
        and a.code = user_area_code(requisitions.establishment_id)
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
        and a.code = user_area_code(requisitions.establishment_id)
    )
  );
