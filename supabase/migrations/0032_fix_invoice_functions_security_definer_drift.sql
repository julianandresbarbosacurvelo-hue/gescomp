-- ============================================================
-- GESCOMP — Migración 0032: revierte drift crítico de seguridad —
-- create_invoice_with_items y reconcile_invoice quedaron como
-- SECURITY DEFINER en producción, sin ningún control interno de rol,
-- anulando en silencio la autorización que dependía de RLS
-- ============================================================
--
-- CONTEXTO: a raíz del reporte de Jose Tique (ver migración 0031) se
-- hizo una auditoría profunda de TODAS las políticas RLS y de si cada
-- función que escribe en una tabla protegida corre como
-- `security invoker` (sujeta a RLS, como declaran las migraciones) o
-- `security definer` (con los privilegios del dueño de la función,
-- que en este proyecto puede saltarse RLS por completo).
--
-- HALLAZGO CRÍTICO: `create_invoice_with_items` (0008) y
-- `reconcile_invoice` (0008, endurecida en 0026) están declaradas
-- `security invoker` en TODAS las migraciones — nunca se documentó
-- ni se quiso que fueran definer — pero en la base de datos real
-- (verificado vía pg_proc.prosecdef) están corriendo como
-- `security definer`. Ninguna de las dos tiene un chequeo interno de
-- rol (a diferencia de otras funciones que sí llaman
-- has_any_role/is_admin_or_buyer explícitamente) — su ÚNICO mecanismo
-- de autorización es RLS: dependen de que el INSERT/UPDATE sobre
-- invoices/invoice_items/purchase_orders/price_history/status_history
-- sea rechazado (o afecte 0 filas, ver `GET DIAGNOSTICS` de la 0026)
-- cuando quien llama no es admin/coordinador_compras.
--
-- Al correr como `security definer`, ese único mecanismo de
-- autorización queda completamente deshabilitado: cualquier usuario
-- autenticado — sin importar su rol o establecimiento — puede invocar
-- estas 2 funciones directamente vía RPC (Supabase expone toda
-- función `public` con permiso `execute` a `authenticated` por
-- defecto) y crear o conciliar facturas de CUALQUIER orden de compra,
-- de cualquier establecimiento, sin pasar por ninguna validación. Esto
-- es exactamente el escenario de "ataque simulado" que la propia
-- migración 0026 documentó como prueba y que dejó de estar cubierto.
--
-- Este es el tercer caso confirmado de la misma clase de drift en este
-- proyecto (ver 0030 sección 3 para el primero, `create_delivery_with_items`
-- para el segundo, ambos aplicados directamente en el SQL Editor de
-- Supabase sin migración correspondiente). El patrón sospechado: al
-- toparse con un error de RLS en el SQL Editor, la salida rápida fue
-- volver la función `security definer` en vez de agregar/corregir la
-- política de RLS que realmente faltaba — eso "arregla" el síntoma
-- pero apaga el control de autorización de raíz, sin dejar ningún
-- rastro en las migraciones. Es el mismo mecanismo de fondo que causó
-- el bug de `alerts` (0031), solo que ahí el atajo nunca se aplicó y
-- por eso el INSERT simplemente fallaba en vez de quedar inseguro.
--
-- CAMBIO: se re-declaran ambas funciones exactamente como en su
-- migración vigente (0008 para create_invoice_with_items, 0026 para
-- reconcile_invoice — misma lógica, ni una línea de comportamiento
-- distinta), forzando `security invoker` en la base real.
--
-- IMPACTO: ningún flujo legítimo cambia — un admin/coordinador_compras
-- generando o conciliando una factura real sigue funcionando idéntico,
-- porque RLS ya lo autoriza (invoices/invoice_items/purchase_orders
-- tienen política de INSERT/UPDATE para is_admin_or_buyer). Lo único
-- que cambia es que un usuario sin ese rol vuelve a recibir el error
-- de autorización esperado en vez de que la operación se ejecute.
--
-- PRUEBA:
--   1. Confirmar en pg_proc que ambas funciones quedan con
--      prosecdef = false tras aplicar esta migración.
--   2. Flujo normal: crear y conciliar una factura real como admin/
--      coordinador_compras → debe funcionar idéntico a antes.
--   3. Ataque simulado (igual que el de la 0026, pero contra estas 2
--      funciones): invocar `create_invoice_with_items` o
--      `reconcile_invoice` vía RPC con la sesión de un usuario sin rol
--      admin/coordinador_compras en ese establecimiento → debe fallar
--      (RLS rechaza el insert/update), no debe crear ni modificar nada.
--
-- RECOMENDACIÓN DE PROCESO (para que esta clase de problema no se
-- repita una cuarta vez): cualquier cambio de RLS, de política, o de
-- `security definer`/`invoker` de una función aplicado directamente en
-- el SQL Editor de Supabase debe ir acompañado, en la misma sesión de
-- trabajo, de una migración que lo deje registrado — nunca aplicarlo
-- solo en producción "para probar" y seguir de largo. Y en particular:
-- un error de RLS nunca se resuelve poniendo la función en
-- `security definer` — eso apaga la autorización en vez de corregirla;
-- la solución correcta casi siempre es agregar o corregir la política
-- de RLS que falta (como en la 0031), igual que ya se hace en el resto
-- de este proyecto.

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
as $$
declare
  v_invoice_id uuid;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_line_total numeric;
  v_ordered numeric;
  v_received numeric;
  v_invoiced numeric;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Una factura debe tener al menos un ítem';
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
$$;

create or replace function reconcile_invoice(
  p_invoice_id uuid,
  p_final_amount_to_pay numeric,
  p_price_adjustments jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
as $$
declare
  v_establishment_id uuid;
  v_purchase_order_id uuid;
  v_supplier_id uuid;
  v_previous_status text;
  v_adj jsonb;
  v_rows int;
begin
  select establishment_id, purchase_order_id, supplier_id
    into v_establishment_id, v_purchase_order_id, v_supplier_id
  from invoices where id = p_invoice_id;

  if v_purchase_order_id is null then
    raise exception 'No se pudo conciliar: la factura no existe o no es visible para este usuario';
  end if;

  select status into v_previous_status from purchase_orders where id = v_purchase_order_id;

  update invoices
  set reconciled_by = auth.uid(), reconciled_at = now(), final_amount_to_pay = p_final_amount_to_pay
  where id = p_invoice_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'No se pudo conciliar la factura: no autorizado';
  end if;

  for v_adj in select * from jsonb_array_elements(p_price_adjustments)
  loop
    insert into price_history (product_id, supplier_id, establishment_id, unit_price, unit_id,
                                source, purchase_order_id, invoice_id, recorded_by)
    values (
      (v_adj->>'product_id')::uuid, v_supplier_id, v_establishment_id,
      (v_adj->>'unit_price')::numeric, (v_adj->>'unit_id')::uuid,
      'conciliacion', v_purchase_order_id, p_invoice_id, auth.uid()
    );
  end loop;

  update purchase_orders set status = 'conciliada' where id = v_purchase_order_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'No se pudo actualizar el estado de la orden asociada: no autorizado';
  end if;

  insert into status_history (entity_type, entity_id, previous_status, new_status, changed_by, notes)
  values ('purchase_order', v_purchase_order_id, v_previous_status, 'conciliada', auth.uid(), 'Conciliación de factura');
end;
$$;
