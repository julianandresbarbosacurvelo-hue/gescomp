-- ============================================================
-- GESCOMP — Migración 0034: una sola factura por orden de compra
-- ============================================================
--
-- REPORTE: tras corregir el registro de la factura de la orden OC-BOG-0001
-- (ver migración anterior sobre el caso de Dayana Duarte / "Tuetano"), se
-- reportó que, ya con la factura cargada y aceptada sin error, la orden
-- seguía apareciendo disponible en "Registrar factura" — es decir, nada
-- impedía volver a registrar una segunda factura para la misma orden.
--
-- CAUSA RAÍZ: el flujo de facturación de este proyecto es 1 orden → 1
-- factura → 1 conciliación (reconcile_invoice recibe un único
-- `p_invoice_id` y marca la orden completa como 'conciliada'; no hay
-- ningún mecanismo que sume o cierre varias facturas de una misma orden).
-- Sin embargo:
--   1. No existía ninguna restricción en la base de datos que impidiera
--      insertar una segunda fila en `invoices` con el mismo
--      `purchase_order_id` — a diferencia de `invoice_number`, que sí
--      tiene `unique(supplier_id, invoice_number)`.
--   2. La pantalla "Registrar factura" (`facturas/nueva`) decide qué
--      órdenes mostrar en el selector únicamente por su estado de
--      recepción (`recibida_parcialmente` / `recibida_totalmente` /
--      `con_novedad`) — nunca se fijaba si esa orden ya tenía una
--      factura. Como registrar una factura NO cambia el estado de la
--      orden (solo la conciliación lo hace, a 'conciliada'), la orden
--      seguía "disponible" indefinidamente, permitiendo generar una
--      segunda factura duplicada para el mismo pedido.
--
-- Es el mismo patrón de fondo que el bug de las órdenes de compra
-- duplicadas de Merca Plaza (migración 0033): una vista/pantalla que no
-- descuenta lo que ya fue gestionado. Ahí la causa era una vista de
-- consolidación; acá es la ausencia de una restricción de integridad.
--
-- CAMBIO:
--   1. `invoices` gana `unique (purchase_order_id)` — a nivel de base de
--      datos, ninguna orden puede tener más de una factura, sin importar
--      qué pantalla o proceso intente insertarla.
--   2. `create_invoice_with_items` valida explícitamente esa condición
--      ANTES de insertar, para devolver un mensaje claro en español en
--      vez de que el usuario vea el error crudo de Postgres
--      ("duplicate key value violates unique constraint...").
--   3. (Ver commit de frontend aparte) La pantalla "Registrar factura"
--      ahora excluye del selector cualquier orden que ya tenga una
--      factura registrada, para que la opción desaparezca en cuanto se
--      registra la factura — igual que "Pedidos por proveedor" excluye
--      lo ya cubierto por una orden.
--
-- VERIFICACIÓN PREVIA: se confirmó en producción que ninguna orden tiene
-- hoy más de una factura (`select purchase_order_id, count(*) from
-- invoices group by purchase_order_id having count(*) > 1` → 0 filas),
-- así que el `unique` se puede aplicar sin conflicto con datos existentes.
--
-- PRUEBA: registrar una factura para una orden ya recibida → funciona
-- igual que antes. Intentar registrar una segunda factura para esa misma
-- orden (vía RPC directa, saltándose el filtro del selector) → debe
-- fallar con el mensaje 'Esta orden de compra ya tiene una factura
-- registrada (...)', sin crear ninguna fila nueva.

alter table invoices add constraint invoices_purchase_order_id_key unique (purchase_order_id);

create or replace function create_invoice_with_items(
  p_purchase_order_id uuid,
  p_establishment_id uuid,
  p_supplier_id uuid,
  p_invoice_number text,
  p_invoice_date date,
  p_file_attachment_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
as $func$
declare
  v_invoice_id uuid;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_line_total numeric;
  v_ordered numeric;
  v_received numeric;
  v_invoiced numeric;
  v_existing_invoice_number text;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Una factura debe tener al menos un ítem';
  end if;

  select invoice_number into v_existing_invoice_number
  from invoices where purchase_order_id = p_purchase_order_id;

  if v_existing_invoice_number is not null then
    raise exception 'Esta orden de compra ya tiene una factura registrada (No. %). Si necesitas corregirla, contacta a un administrador en vez de registrar una nueva.', v_existing_invoice_number;
  end if;

  insert into invoices (establishment_id, purchase_order_id, supplier_id, invoice_number, invoice_date,
                         file_attachment_id, total)
  values (p_establishment_id, p_purchase_order_id, p_supplier_id, p_invoice_number, p_invoice_date,
          p_file_attachment_id, 0)
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := (v_item->>'quantity_invoiced')::numeric * (v_item->>'unit_price_invoiced')::numeric;
    v_subtotal := v_subtotal + v_line_total;

    insert into invoice_items (invoice_id, purchase_order_item_id, quantity_invoiced, unit_price_invoiced, line_total)
    values (v_invoice_id, (v_item->>'purchase_order_item_id')::uuid,
            (v_item->>'quantity_invoiced')::numeric, (v_item->>'unit_price_invoiced')::numeric, v_line_total);

    -- ---------- Three-Way Match: orden vs. recepción vs. factura ----------
    select quantity into v_ordered from purchase_order_items where id = (v_item->>'purchase_order_item_id')::uuid;

    select coalesce(sum(di.quantity_received), 0) into v_received
    from delivery_items di where di.purchase_order_item_id = (v_item->>'purchase_order_item_id')::uuid;

    v_invoiced := (v_item->>'quantity_invoiced')::numeric;

    if v_invoiced <> v_received or v_invoiced <> v_ordered then
      insert into alerts (type, establishment_id, entity_type, entity_id, severity, message)
      values (
        'diferencia_factura', p_establishment_id, 'invoice', v_invoice_id,
        case when abs(v_invoiced - v_received) / nullif(v_received, 0) > 0.1 then 'critica' else 'advertencia' end,
        format('Three-way match: ordenado %s, recibido %s, facturado %s', v_ordered, v_received, v_invoiced)
      );
    end if;
  end loop;

  update invoices set subtotal = v_subtotal, total = v_subtotal where id = v_invoice_id;

  return v_invoice_id;
end;
$func$;
