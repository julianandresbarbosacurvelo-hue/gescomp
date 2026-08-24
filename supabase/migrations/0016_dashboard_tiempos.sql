-- ============================================================
-- GESCOMP — Migración 0016: tiempo promedio de abastecimiento
-- en el dashboard (hueco detectado en la Etapa Frontend 2 — IA)
-- ============================================================

create or replace function get_dashboard_summary(p_establishment_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_compras jsonb;
  v_operacion jsonb;
  v_proveedores jsonb;
  v_precios jsonb;
  v_tiempos jsonb;
begin
  select jsonb_build_object(
    'hoy', coalesce(sum(total) filter (where created_at::date = current_date), 0),
    'semana', coalesce(sum(total) filter (where created_at >= date_trunc('week', now())), 0),
    'mes', coalesce(sum(total) filter (where created_at >= date_trunc('month', now())), 0),
    'anio', coalesce(sum(total) filter (where created_at >= date_trunc('year', now())), 0)
  ) into v_compras
  from purchase_orders
  where establishment_id = p_establishment_id and status <> 'cancelada';

  select jsonb_build_object(
    'requerimientos_pendientes', (select count(*) from requisitions where establishment_id = p_establishment_id and status = 'enviado'),
    'ordenes_abiertas', (select count(*) from purchase_orders where establishment_id = p_establishment_id and status not in ('cerrada','cancelada')),
    'entregas_pendientes', (select count(*) from purchase_orders where establishment_id = p_establishment_id and status in ('orden_generada','enviada_al_proveedor','confirmada')),
    'entregas_atrasadas', (select count(*) from purchase_orders where establishment_id = p_establishment_id and expected_delivery_date < current_date and status not in ('recibida_totalmente','con_novedad','conciliada','cerrada','cancelada')),
    'recepciones_con_novedad', (select count(*) from purchase_orders where establishment_id = p_establishment_id and status = 'con_novedad')
  ) into v_operacion;

  with por_proveedor as (
    select
      s.id, coalesce(s.trade_name, s.legal_name) as name,
      sum(po.total) as valor_comprado,
      count(*) filter (where po.status = 'con_novedad') as novedades,
      count(*) filter (where d.is_partial) as entregas_parciales,
      avg(extract(epoch from (d.delivery_date - po.created_at)) / 86400) as dias_promedio_entrega,
      count(*) filter (where d.delivery_date is not null and d.delivery_date::date <= po.expected_delivery_date)::numeric
        / nullif(count(*) filter (where d.delivery_date is not null), 0) as cumplimiento
    from purchase_orders po
    join suppliers s on s.id = po.supplier_id
    left join deliveries d on d.purchase_order_id = po.id
    where po.establishment_id = p_establishment_id and po.status <> 'cancelada'
    group by s.id, s.trade_name, s.legal_name
  )
  select jsonb_build_object(
    'mayor_volumen', (select jsonb_build_object('nombre', name, 'valor', valor_comprado) from por_proveedor order by valor_comprado desc nulls last limit 1),
    'detalle', (
      select jsonb_agg(jsonb_build_object(
        'nombre', name, 'valor_comprado', valor_comprado, 'novedades', novedades,
        'entregas_parciales', entregas_parciales,
        'dias_promedio_entrega', round(dias_promedio_entrega::numeric, 1),
        'cumplimiento_pct', round(coalesce(cumplimiento, 0) * 100, 1)
      ))
      from por_proveedor
    )
  ) into v_proveedores;

  with ultimos_dos as (
    select product_id, unit_price, recorded_at,
      row_number() over (partition by product_id order by recorded_at desc) as rn
    from price_history where establishment_id = p_establishment_id
  ),
  variacion as (
    select a.product_id, a.unit_price as precio_actual, b.unit_price as precio_anterior,
      round(((a.unit_price - b.unit_price) / nullif(b.unit_price, 0)) * 100, 2) as variacion_pct
    from ultimos_dos a join ultimos_dos b on b.product_id = a.product_id and b.rn = 2
    where a.rn = 1
  )
  select jsonb_build_object(
    'mayor_aumento', (select jsonb_agg(jsonb_build_object('producto', p.name, 'variacion_pct', v.variacion_pct)) from (select * from variacion order by variacion_pct desc nulls last limit 5) v join products p on p.id = v.product_id),
    'mayor_disminucion', (select jsonb_agg(jsonb_build_object('producto', p.name, 'variacion_pct', v.variacion_pct)) from (select * from variacion order by variacion_pct asc nulls last limit 5) v join products p on p.id = v.product_id),
    'variacion_anormal', (select jsonb_agg(jsonb_build_object('producto', p.name, 'variacion_pct', v.variacion_pct)) from variacion v join products p on p.id = v.product_id where abs(v.variacion_pct) > 20),
    'cantidad_variacion_anormal', (select count(*) from variacion where abs(variacion_pct) > 20)
  ) into v_precios;

  -- ---------- NUEVO: tiempo promedio de abastecimiento (solicitud → recepción total) ----------
  -- Aproximación: para cada requerimiento, la fecha de recepción es la más temprana en que
  -- CUALQUIERA de las órdenes que cubren sus ítems alcanzó 'recibida_totalmente'. No es exacto
  -- al 100% en casos raros (un ítem cubierto por dos órdenes distintas), pero es una muy buena
  -- aproximación para el KPI gerencial que pediste.
  with tiempos as (
    select r.id as requisition_id, r.created_at as solicitado_en, min(sh.changed_at) as recibido_en
    from requisitions r
    join requisition_items ri on ri.requisition_id = r.id
    join purchase_order_item_sources pois on pois.requisition_item_id = ri.id
    join purchase_order_items poi on poi.id = pois.purchase_order_item_id
    join status_history sh on sh.entity_type = 'purchase_order' and sh.entity_id = poi.purchase_order_id and sh.new_status = 'recibida_totalmente'
    where r.establishment_id = p_establishment_id
    group by r.id, r.created_at
  )
  select jsonb_build_object(
    'horas_promedio', round(avg(extract(epoch from (recibido_en - solicitado_en)) / 3600)::numeric, 1),
    'dias_promedio', round(avg(extract(epoch from (recibido_en - solicitado_en)) / 86400)::numeric, 1),
    'muestras', count(*)
  ) into v_tiempos
  from tiempos;

  return jsonb_build_object(
    'compras', v_compras, 'operacion', v_operacion, 'proveedores', v_proveedores,
    'precios', v_precios, 'tiempos', v_tiempos
  );
end;
$$;
