-- ============================================================
-- GESCOMP — Migración 0021: filtros de la barra de Analítica
-- (Etapa 13, resuelto a pedido explícito tras el gap #1)
-- ============================================================

create or replace function get_monthly_spend(
  p_establishment_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_supplier_id uuid default null,
  p_product_id uuid default null,
  p_category_id uuid default null,
  p_area_id uuid default null
)
returns jsonb
language sql stable
security invoker
as $$
  select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'valor', valor) order by mes), '[]'::jsonb)
  from (
    select date_trunc('month', po.created_at) as mes, sum(poi.line_total) as valor
    from purchase_order_items poi
    join purchase_orders po on po.id = poi.purchase_order_id
    left join products p on p.id = poi.product_id
    where po.establishment_id = p_establishment_id
      and po.status <> 'cancelada'
      and po.created_at >= coalesce(p_start_date::timestamptz, now() - interval '12 months')
      and po.created_at <= coalesce(p_end_date::timestamptz, now())
      and (p_supplier_id is null or po.supplier_id = p_supplier_id)
      and (p_product_id is null or poi.product_id = p_product_id)
      and (p_category_id is null or p.category_id = p_category_id)
      and (p_area_id is null or exists (
        select 1 from purchase_order_item_sources pois
        join requisition_items ri on ri.id = pois.requisition_item_id
        join requisitions r on r.id = ri.requisition_id
        where pois.purchase_order_item_id = poi.id and r.area_id = p_area_id
      ))
    group by date_trunc('month', po.created_at)
  ) g;
$$;

create or replace function get_abc_analysis(
  p_establishment_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_supplier_id uuid default null,
  p_area_id uuid default null
)
returns table (product_id uuid, product_name text, valor_comprado numeric, porcentaje_acumulado numeric, clase text)
language sql stable
security invoker
as $$
  with valor_por_producto as (
    select poi.product_id, sum(coalesce(poi.line_total, 0)) as valor
    from purchase_order_items poi
    join purchase_orders po on po.id = poi.purchase_order_id
    where po.establishment_id = p_establishment_id
      and po.status <> 'cancelada'
      and poi.product_id is not null
      and po.created_at >= coalesce(p_start_date::timestamptz, '-infinity'::timestamptz)
      and po.created_at <= coalesce(p_end_date::timestamptz, now())
      and (p_supplier_id is null or po.supplier_id = p_supplier_id)
      and (p_area_id is null or exists (
        select 1 from purchase_order_item_sources pois
        join requisition_items ri on ri.id = pois.requisition_item_id
        join requisitions r on r.id = ri.requisition_id
        where pois.purchase_order_item_id = poi.id and r.area_id = p_area_id
      ))
    group by poi.product_id
  ),
  con_acumulado as (
    select product_id, valor,
      sum(valor) over (order by valor desc rows between unbounded preceding and current row) as acumulado,
      sum(valor) over () as total
    from valor_por_producto
  )
  select c.product_id, p.name, c.valor, round(c.acumulado / nullif(c.total, 0) * 100, 2),
    case when c.acumulado / nullif(c.total, 0) <= 0.80 then 'A' when c.acumulado / nullif(c.total, 0) <= 0.95 then 'B' else 'C' end
  from con_acumulado c join products p on p.id = c.product_id
  order by c.valor desc;
$$;

create or replace function get_category_pareto(
  p_establishment_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_supplier_id uuid default null,
  p_area_id uuid default null
)
returns table (category_name text, valor numeric, porcentaje_acumulado numeric, clase text)
language sql stable
security invoker
as $$
  with valor_por_categoria as (
    select c.name, sum(coalesce(poi.line_total, 0)) as valor
    from purchase_order_items poi
    join purchase_orders po on po.id = poi.purchase_order_id
    join products p on p.id = poi.product_id
    join categories c on c.id = p.category_id
    where po.establishment_id = p_establishment_id
      and po.status <> 'cancelada'
      and po.created_at >= coalesce(p_start_date::timestamptz, '-infinity'::timestamptz)
      and po.created_at <= coalesce(p_end_date::timestamptz, now())
      and (p_supplier_id is null or po.supplier_id = p_supplier_id)
      and (p_area_id is null or exists (
        select 1 from purchase_order_item_sources pois
        join requisition_items ri on ri.id = pois.requisition_item_id
        join requisitions r on r.id = ri.requisition_id
        where pois.purchase_order_item_id = poi.id and r.area_id = p_area_id
      ))
    group by c.name
  ),
  con_acumulado as (
    select name, valor,
      sum(valor) over (order by valor desc rows between unbounded preceding and current row) as acumulado,
      sum(valor) over () as total
    from valor_por_categoria
  )
  select name, valor, round(acumulado / nullif(total, 0) * 100, 2),
    case when acumulado / nullif(total, 0) <= 0.80 then 'A' when acumulado / nullif(total, 0) <= 0.95 then 'B' else 'C' end
  from con_acumulado
  order by valor desc;
$$;
