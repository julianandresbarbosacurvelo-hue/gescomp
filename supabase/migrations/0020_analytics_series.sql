-- ============================================================
-- GESCOMP — Migración 0020: series para Analítica (Etapa 13)
-- ============================================================

-- Gasto mensual total del establecimiento (últimos 12 meses) — no existía una serie
-- agregada a nivel de establecimiento, solo por producto o por proveedor.
create or replace function get_monthly_spend(p_establishment_id uuid)
returns jsonb
language sql stable
security invoker
as $$
  select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'valor', valor) order by mes), '[]'::jsonb)
  from (
    select date_trunc('month', created_at) as mes, sum(total) as valor
    from purchase_orders
    where establishment_id = p_establishment_id
      and status <> 'cancelada'
      and created_at >= now() - interval '12 months'
    group by date_trunc('month', created_at)
  ) g;
$$;

-- Pareto por categoría (sección 30/77 del brief pide alternar producto/proveedor/categoría;
-- producto ya existe vía get_abc_analysis, proveedor sale del dashboard — faltaba categoría).
create or replace function get_category_pareto(p_establishment_id uuid)
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
    where po.establishment_id = p_establishment_id and po.status <> 'cancelada'
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
