-- ============================================================
-- GESCOMP — Migración 0010: Analítica — ficha de producto y
-- ABC/Pareto (Fase 14)
-- ============================================================

-- ---------- Ficha analítica de producto (sección 24 de tu documento original) ----------
-- Basa cantidades/frecuencia en eventos de RECEPCIÓN real (delivery_items), no en lo
-- ordenado, porque lo que efectivamente entró al restaurante es lo relevante para el análisis.
create or replace function get_product_analysis(p_product_id uuid, p_establishment_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_resumen jsonb;
  v_series jsonb;
  v_periodicidad jsonb;
  v_proveedor_principal jsonb;
begin
  with eventos as (
    select
      d.delivery_date::date as fecha,
      di.quantity_received as cantidad,
      di.quantity_received * coalesce(poi.agreed_unit_price, 0) as valor,
      po.supplier_id
    from delivery_items di
    join deliveries d on d.id = di.delivery_id
    join purchase_order_items poi on poi.id = di.purchase_order_item_id
    join purchase_orders po on po.id = poi.purchase_order_id
    where poi.product_id = p_product_id and d.establishment_id = p_establishment_id
  ),
  precios as (
    select unit_price from price_history
    where product_id = p_product_id and establishment_id = p_establishment_id
  )
  select jsonb_build_object(
    'cantidad_12_meses', coalesce((select sum(cantidad) from eventos where fecha >= current_date - interval '12 months'), 0),
    'valor_total_12_meses', coalesce((select sum(valor) from eventos where fecha >= current_date - interval '12 months'), 0),
    'precio_actual', (select unit_price from price_history where product_id = p_product_id and establishment_id = p_establishment_id order by recorded_at desc limit 1),
    'precio_promedio', (select round(avg(unit_price), 2) from precios),
    'precio_minimo', (select min(unit_price) from precios),
    'precio_maximo', (select max(unit_price) from precios),
    'ultima_compra', (select max(fecha) from eventos)
  ) into v_resumen;

  -- proveedor principal: el que más cantidad ha suministrado de este producto
  select jsonb_build_object('proveedor', coalesce(s.trade_name, s.legal_name), 'cantidad', totales.cantidad)
  into v_proveedor_principal
  from (
    select supplier_id, sum(cantidad) as cantidad
    from eventos group by supplier_id order by sum(cantidad) desc limit 1
  ) totales
  join suppliers s on s.id = totales.supplier_id;

  -- series para gráficos: precio vs tiempo, cantidad vs tiempo, gasto mensual
  select jsonb_build_object(
    'precio_vs_tiempo', (
      select jsonb_agg(jsonb_build_object('fecha', recorded_at::date, 'precio', unit_price) order by recorded_at)
      from price_history where product_id = p_product_id and establishment_id = p_establishment_id
    ),
    'cantidad_vs_tiempo', (
      select jsonb_agg(jsonb_build_object('fecha', fecha, 'cantidad', cantidad) order by fecha)
      from eventos
    ),
    'gasto_mensual', (
      select jsonb_agg(jsonb_build_object('mes', mes, 'valor', valor) order by mes)
      from (
        select date_trunc('month', fecha) as mes, sum(valor) as valor
        from eventos group by date_trunc('month', fecha)
      ) g
    )
  ) into v_series;

  -- periodicidad: días entre compras consecutivas
  with fechas as (
    select fecha, fecha - lag(fecha) over (order by fecha) as dias
    from (select distinct fecha from eventos) f
  )
  select jsonb_build_object(
    'numero_compras', (select count(distinct fecha) from eventos),
    'dias_promedio_entre_compras', (select round(avg(dias), 1) from fechas),
    'dias_mediana_entre_compras', (select percentile_cont(0.5) within group (order by dias) from fechas)
  ) into v_periodicidad;

  return jsonb_build_object(
    'resumen', v_resumen,
    'proveedor_principal', v_proveedor_principal,
    'series', v_series,
    'periodicidad', v_periodicidad
  );
end;
$$;

-- ---------- Clasificación ABC / Pareto (secciones 29-30) ----------
create or replace function get_abc_analysis(p_establishment_id uuid)
returns table (
  product_id uuid,
  product_name text,
  valor_comprado numeric,
  porcentaje_acumulado numeric,
  clase text
)
language sql stable
security invoker
as $$
  with valor_por_producto as (
    select poi.product_id, sum(coalesce(poi.line_total, 0)) as valor
    from purchase_order_items poi
    join purchase_orders po on po.id = poi.purchase_order_id
    where po.establishment_id = p_establishment_id and po.status <> 'cancelada' and poi.product_id is not null
    group by poi.product_id
  ),
  con_acumulado as (
    select
      v.product_id, v.valor,
      sum(v.valor) over (order by v.valor desc rows between unbounded preceding and current row) as acumulado,
      sum(v.valor) over () as total
    from valor_por_producto v
  )
  select
    c.product_id, p.name,
    c.valor,
    round(c.acumulado / nullif(c.total, 0) * 100, 2),
    case
      when c.acumulado / nullif(c.total, 0) <= 0.80 then 'A'
      when c.acumulado / nullif(c.total, 0) <= 0.95 then 'B'
      else 'C'
    end
  from con_acumulado c
  join products p on p.id = c.product_id
  order by c.valor desc;
$$;
