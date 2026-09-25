-- ============================================================
-- GESCOMP — Migración 0036: anular ítems/pedido completo desde
-- "Pedidos por Proveedor" (Nueva orden), no solo desde el
-- requerimiento original
-- ============================================================
--
-- ANTES: la migración 0035 dejó anular un ítem puntual o una
-- requisición completa (`cancel_requisition_item`,
-- `cancel_requisition`), pero solo desde el Detalle de Requerimiento
-- — es decir, desde la perspectiva del área que lo solicitó (Bar,
-- Servicio, Cocina).
--
-- El usuario probó la funcionalidad exactamente donde la necesita en
-- la práctica: en "Pedidos por Proveedor" → "Nueva orden" (la
-- pantalla donde el administrador/coordinador de compras gestiona lo
-- consolidado ANTES de enviárselo a un proveedor concreto, ej.
-- "Orden para D1") — y ahí no existía ninguna opción de anular, solo
-- de cancelar la orden completa DESPUÉS de generarla
-- (`cancel_purchase_order`, migración 0013).
--
-- CAUSA RAÍZ DEL HUECO: un producto consolidado en "Nueva orden"
-- (fila de `v_pedidos_por_proveedor`) casi nunca corresponde a un
-- solo `requisition_item` — normalmente es la suma de varios ítems
-- de varios requerimientos, incluso de varias áreas distintas, que
-- pidieron el mismo producto (`breakdown_by_area` ya trae el
-- `requisition_item_id` de cada uno, ver migración 0033). Por eso
-- `cancel_requisition_item` (pensada para UN ítem) y
-- `cancel_requisition` (pensada para UNA requisición completa) no
-- alcanzan acá: anular "Lychee Almibar" en el pedido de D1 puede
-- significar anular 3 ítems reales, de 3 requerimientos distintos, de
-- 2 áreas distintas.
--
-- CAMBIO: función nueva `cancel_requisition_items_batch(p_requisition_item_ids uuid[], p_reason text)`.
-- No duplica ninguna regla: por cada id de la lista, llama a la misma
-- `cancel_requisition_item` ya construida en la migración 0035 (motivo
-- obligatorio, ítem no anulado antes, requisición dueña aún
-- 'enviado', mismo registro en status_history). Al ser una sola
-- llamada a función, todo corre en una sola transacción: si CUALQUIER
-- ítem de la lista no se puede anular (ya anulado, requisición ya
-- convertida/cerrada por otro proceso mientras tanto, etc.), la
-- función completa falla y no se anula NADA de esa lista — evita
-- dejar un producto "a medias" anulado en el pedido.
--
-- Esta función sirve para los dos botones nuevos de "Nueva orden":
--   - "Anular" en un producto puntual → se le pasan solo los
--     requisition_item_id de `breakdown_by_area` de ESA fila.
--   - "Anular todo este pedido" → se le pasan los requisition_item_id
--     de TODAS las filas que se ven consolidadas para ese proveedor
--     en esa pantalla (no toca otros proveedores).
--
-- No se toca `cancel_requisition_item` ni `cancel_requisition`: el
-- Detalle de Requerimiento (perspectiva del área) sigue funcionando
-- exactamente igual que en la migración 0035; esta es una entrada
-- adicional para cuando compras gestiona el pedido por proveedor.
--
-- IMPACTO: no cambia ningún flujo existente. Solo agrega una función
-- nueva; los ítems ya anulados por 0035 no se ven afectados
-- (`cancel_requisition_item` ya rechaza reanular un ítem).
--
-- PRUEBA:
--   - `select cancel_requisition_items_batch(array[]::uuid[], 'x')`
--     debe fallar con 'No hay ítems para anular'.
--   - Con 2 ítems válidos + 1 ya anulado en la misma lista, la función
--     completa debe fallar (por el ya anulado) y los otros 2 deben
--     seguir SIN anular (no queda nada a medias).
--   - Con una lista de ítems válidos de 2 requerimientos distintos, la
--     función debe anular ambos y dejar 2 filas nuevas en
--     status_history, una por ítem.

create or replace function cancel_requisition_items_batch(p_requisition_item_ids uuid[], p_reason text)
returns void
language plpgsql
security invoker
as $$
declare
  v_item_id uuid;
begin
  if p_requisition_item_ids is null or array_length(p_requisition_item_ids, 1) is null then
    raise exception 'No hay ítems para anular';
  end if;

  foreach v_item_id in array p_requisition_item_ids loop
    perform cancel_requisition_item(v_item_id, p_reason);
  end loop;
end;
$$;
