-- ============================================================
-- GESCOMP — Migración 0033: la consolidación de "Pedidos por
-- Proveedor" no descontaba lo ya llevado a una orden de compra,
-- provocando compras duplicadas
-- ============================================================
--
-- REPORTE: se generaron las órdenes OC-RCS-2026-0004 y OC-RCS-2026-0005
-- para el proveedor Merca Plaza. Al volver a entrar a "Pedidos por
-- proveedor", los mismos ítems seguían apareciendo disponibles para
-- gestionar, permitiendo generar una nueva orden que vuelve a incluir
-- cantidades que ya estaban en 0004/0005 — es decir, duplicando el
-- pedido en vez de mostrar que ya fue atendido.
--
-- CAUSA RAÍZ: `v_consolidated_requisition_items` (Fase 9, migración
-- 0004) agrupa por producto TODOS los ítems de requerimientos cuyo
-- requerimiento sigue en estado 'enviado' — pero un requerimiento solo
-- pasa a 'en_orden' cuando TODOS sus ítems quedaron cubiertos por
-- alguna orden (ver `create_purchase_order_with_items`, sección final).
-- Si un mismo requerimiento tiene productos de más de un proveedor (o
-- se generó una orden para unos ítems pero no para todos), el
-- requerimiento se queda en 'enviado' indefinidamente, y la vista
-- seguía sumando la cantidad ORIGINAL de cada ítem sin restar lo que
-- ya se asignó a una orden vía `purchase_order_item_sources` — no
-- existe (ni existió nunca) una resta contra lo ya ordenado.
--
-- CAMBIO: `v_consolidated_requisition_items` ahora calcula, por cada
-- ítem, la cantidad pendiente = cantidad del ítem − suma de
-- `quantity_allocated` ya registrada para ese ítem en
-- `purchase_order_item_sources`. Un ítem ya cubierto por completo
-- (pendiente <= 0) se excluye por completo de la consolidación —
-- desaparece de "Pedidos por proveedor" apenas se genera la orden que
-- lo cubre, sin depender de que el requerimiento como un todo cambie
-- de estado. Un ítem cubierto solo parcialmente muestra únicamente el
-- remanente pendiente, no la cantidad original — así una segunda orden
-- para el mismo producto solo puede pedir lo que de verdad falta.
-- `v_pedidos_por_proveedor` (0005, endurecida en 0027) no se toca:
-- hereda el fix automáticamente porque se arma sobre esta vista.
--
-- IMPACTO: no cambia nada del flujo normal cuando un ítem se cubre por
-- completo en una sola orden (que es el caso típico) — solo corrige el
-- caso donde un requerimiento queda "a medias" entre proveedores/
-- órdenes, que es exactamente el que produjo el reporte. El campo
-- `quantity` dentro de `breakdown_by_area` (usado para armar `sources`
-- al generar una nueva orden, ver Nueva orden de compra) ahora
-- refleja el remanente pendiente por área, no el total original —
-- así una orden generada sobre datos ya parcialmente cubiertos asigna
-- (`quantity_allocated`) solo lo que realmente falta, sin doble conteo.
--
-- PRUEBA: con OC-RCS-2026-0004 y 0005 ya generadas para Merca Plaza,
-- entrar a "Pedidos por proveedor" → los productos ya cubiertos por
-- esas 2 órdenes NO deben aparecer más bajo Merca Plaza (ni bajo
-- ningún proveedor). Si algún ítem de esas órdenes quedó cubierto solo
-- parcialmente (cantidad pedida en la orden menor a la del
-- requerimiento), debe seguir apareciendo pero solo por la diferencia
-- pendiente, nunca por el total original.

create or replace view v_consolidated_requisition_items as
select
  r.establishment_id,
  ri.product_id,
  ri.unregistered_product_name,
  ri.unit_id,
  sum(pend.pending_quantity) as total_quantity,
  jsonb_agg(jsonb_build_object(
    'area_code', a.code,
    'area_name', a.name,
    'quantity', pend.pending_quantity,
    'requisition_id', r.id,
    'requisition_item_id', ri.id,
    'priority', ri.priority
  )) as breakdown_by_area,
  max(ri.priority) filter (where ri.priority = 'urgente') is not null as has_urgent
from requisition_items ri
join requisitions r on r.id = ri.requisition_id
join areas a on a.id = r.area_id
cross join lateral (
  select ri.quantity - coalesce((
    select sum(pois.quantity_allocated)
    from purchase_order_item_sources pois
    where pois.requisition_item_id = ri.id
  ), 0) as pending_quantity
) pend
where r.status = 'enviado'
  and pend.pending_quantity > 0
group by r.establishment_id, ri.product_id, ri.unregistered_product_name, ri.unit_id;
