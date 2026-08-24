-- ============================================================
-- GESCOMP — Migración 0019: análisis 360° de proveedor
-- (Etapa Frontend 12 — no existía una función por proveedor
-- individual, solo el agregado de todos en el dashboard)
-- ============================================================

create or replace function get_supplier_analysis(p_supplier_id uuid, p_establishment_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_resumen jsonb;
  v_series jsonb;
  v_productos jsonb;
begin
  with ordenes as (
    select po.*, d.delivery_date, d.is_partial
    from purchase_orders po
    left join deliveries d on d.purchase_order_id = po.id
    where po.supplier_id = p_supplier_id and po.establishment_id = p_establishment_id and po.status <> 'cancelada'
  )
  select jsonb_build_object(
    'valor_comprado', coalesce(sum(total), 0),
    'numero_ordenes', count(distinct id),
    'dias_promedio_entrega', round(avg(extract(epoch from (delivery_date - created_at)) / 86400)::numeric, 1),
    'cumplimiento_pct', round(
      (count(*) filter (where delivery_date is not null and delivery_date::date <= expected_delivery_date))::numeric
      / nullif(count(*) filter (where delivery_date is not null), 0) * 100, 1
    ),
    'novedades', count(distinct id) filter (where status = 'con_novedad'),
    'entregas_parciales', count(*) filter (where is_partial)
  ) into v_resumen
  from ordenes;

  select jsonb_build_object(
    'compras_mensuales', (
      select jsonb_agg(jsonb_build_object('mes', mes, 'valor', valor) order by mes)
      from (
        select date_trunc('month', created_at) as mes, sum(total) as valor
        from purchase_orders
        where supplier_id = p_supplier_id and establishment_id = p_establishment_id and status <> 'cancelada'
        group by date_trunc('month', created_at)
      ) g
    )
  ) into v_series;

  select jsonb_agg(jsonb_build_object('producto', nombre, 'valor', valor) order by valor desc)
  into v_productos
  from (
    select p.name as nombre, sum(poi.line_total) as valor
    from purchase_order_items poi
    join purchase_orders po on po.id = poi.purchase_order_id
    join products p on p.id = poi.product_id
    where po.supplier_id = p_supplier_id and po.establishment_id = p_establishment_id and po.status <> 'cancelada'
    group by p.name
    order by sum(poi.line_total) desc
    limit 8
  ) top;

  return jsonb_build_object('resumen', v_resumen, 'series', v_series, 'productos_principales', v_productos);
end;
$$;
