-- ============================================================
-- GESCOMP — Migración 0004: Requerimientos y consolidación (Fase 9)
-- ============================================================

-- ---------- Consecutivos legibles por establecimiento (REQ-BOG-0001, OC-MED-0001...) ----------
alter table establishments add column if not exists short_code text unique;
update establishments set short_code = 'BOG' where id = '11111111-1111-1111-1111-111111111111';
update establishments set short_code = 'MED' where id = '22222222-2222-2222-2222-222222222222';
alter table establishments alter column short_code set not null;

create table if not exists code_counters (
  establishment_id uuid not null references establishments(id),
  entity_type text not null, -- 'requisition' | 'purchase_order'
  last_number int not null default 0,
  primary key (establishment_id, entity_type)
);

create or replace function next_code(p_establishment_id uuid, p_entity_type text, p_prefix text)
returns text
language plpgsql
as $$
declare
  v_number int;
  v_short_code text;
begin
  insert into code_counters (establishment_id, entity_type, last_number)
  values (p_establishment_id, p_entity_type, 1)
  on conflict (establishment_id, entity_type)
  do update set last_number = code_counters.last_number + 1
  returning last_number into v_number;

  select short_code into v_short_code from establishments where id = p_establishment_id;

  return p_prefix || '-' || v_short_code || '-' || lpad(v_number::text, 4, '0');
end;
$$;

-- ---------- Creación transaccional de un requerimiento con sus ítems ----------
-- p_items: jsonb array de objetos:
--   { "product_id": uuid | null, "unregistered_product_name": text | null,
--     "quantity": numeric, "unit_id": uuid, "priority": text | null, "notes": text | null }
create or replace function create_requisition_with_items(
  p_establishment_id uuid,
  p_area_id uuid,
  p_required_date date,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker -- respeta RLS del usuario que llama, no eleva privilegios
as $$
declare
  v_requisition_id uuid;
  v_code text;
  v_item jsonb;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Un requerimiento debe tener al menos un ítem';
  end if;

  v_code := next_code(p_establishment_id, 'requisition', 'REQ');

  insert into requisitions (code, establishment_id, area_id, requested_by, status, required_date, notes)
  values (v_code, p_establishment_id, p_area_id, auth.uid(), 'enviado', p_required_date, p_notes)
  returning id into v_requisition_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into requisition_items (
      requisition_id, product_id, unregistered_product_name, quantity, unit_id, priority, notes
    ) values (
      v_requisition_id,
      nullif(v_item->>'product_id','')::uuid,
      nullif(v_item->>'unregistered_product_name',''),
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_id')::uuid,
      nullif(v_item->>'priority',''),
      nullif(v_item->>'notes','')
    );
  end loop;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by)
  values ('requisition', v_requisition_id, null, 'enviado', auth.uid());

  return v_requisition_id;
end;
$$;

-- ---------- Vista de consolidación (Bandeja de Compras) ----------
-- Agrupa por producto los ítems de requerimientos aún no llevados a orden (status = 'enviado'),
-- conservando el detalle por área en un jsonb para poder expandirlo en la UI.
create or replace view v_consolidated_requisition_items as
select
  r.establishment_id,
  ri.product_id,
  ri.unregistered_product_name,
  ri.unit_id,
  sum(ri.quantity) as total_quantity,
  jsonb_agg(jsonb_build_object(
    'area_code', a.code,
    'area_name', a.name,
    'quantity', ri.quantity,
    'requisition_id', r.id,
    'requisition_item_id', ri.id,
    'priority', ri.priority
  )) as breakdown_by_area,
  max(ri.priority) filter (where ri.priority = 'urgente') is not null as has_urgent
from requisition_items ri
join requisitions r on r.id = ri.requisition_id
join areas a on a.id = r.area_id
where r.status = 'enviado'
group by r.establishment_id, ri.product_id, ri.unregistered_product_name, ri.unit_id;

-- La vista hereda RLS de las tablas base (requisitions/requisition_items), así que un
-- usuario de área jamás verá aquí lo consolidado de otras áreas — solo compras/admin,
-- porque son quienes tienen SELECT abierto sobre todas las áreas de su establecimiento.
