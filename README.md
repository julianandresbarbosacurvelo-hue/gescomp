# Gescomp

Sistema de abastecimiento, compras y control de costos — restaurante (multi-establecimiento).

## Setup inicial (Fase 6)

1. **Repositorio:** crear repo `gescomp` en GitHub, subir este scaffold como primer commit.
2. **Supabase:** crear proyecto llamado **Gescomp**. En el SQL Editor, ejecutar `supabase/migrations/0001_init_schema.sql` (o vía `supabase db push` con la CLI conectada al proyecto).
3. **Variables de entorno:** copiar `.env.local.example` a `.env.local` y completar con las credenciales del proyecto Supabase (Project Settings → API).
4. **Instalar dependencias:** `npm install`.
5. **Vercel:** conectar el repo, configurar las mismas variables de entorno en el dashboard de Vercel.

## Estado del proyecto

- ✅ Fase 1 — Análisis funcional
- ✅ Fase 2 — Arquitectura y modelo de datos
- ✅ Fase 3 — Validación de flujos
- ✅ Fase 4/5 — UX/UI (navegación + wireframes)
- ✅ Fase 6 — Setup del proyecto
- ✅ Fase 7 — Autenticación y roles (RLS)
- ✅ Fase 8 — Maestros (categorías/productos con patrón completo) + datos de demostración
- ✅ Fase 9 — Requerimientos: creación móvil (RPC transaccional), Mis Requerimientos, Bandeja consolidada por producto/área
- ✅ Fase 10 — Compras: Pedidos por Proveedor + generación transaccional de Orden de Compra
- ✅ Generación de PDF de la orden (pdf-lib) + subida a Storage + adjunto vinculado, más la política RLS de `attachments` que había quedado pendiente desde la Fase 7
- ✅ Fase 11 — Recepciones: función transaccional `create_delivery_with_items` (ordenado vs. recibido, conforme/con novedad, parcialidad acumulada, alertas automáticas, precio de factura opcional → `price_history`)
- ✅ Fase 12 — Facturas y Three-Way Match: `create_invoice_with_items`, `reconcile_invoice`, `close_purchase_order`
- ✅ Fase 13 — Dashboard ejecutivo: `get_dashboard_summary`
- ✅ Fase 14 — Analítica: `get_product_analysis`, `get_abc_analysis`
- ✅ Fase 15 — Alertas: 7 tipos de anomalía completos + bandeja con resolución
- ✅ Fase 16 — Auditoría: trigger genérico `trg_audit_log`
- ✅ Fase 17 — QA: plan de pruebas + corrección de `cancelPurchaseOrder` (faltaba) y de integridad en `create_delivery_with_items` (validación de que el ítem pertenece a la orden)
- ✅ Fase 18 — Producción: checklist de despliegue, guía de import masivo, pendientes fuera del alcance del MVP

- ✅ Etapa Frontend 2 — Information Architecture: sitemap completo (rutas reales por Server Action), sidebar por grupos, bottom nav por rol, dashboard por rol. Hueco encontrado: falta "tiempo promedio de abastecimiento" en `get_dashboard_summary` (pendiente para Etapa 5, no bloquea)
- ✅ Etapa Frontend 3 — Design System: plan de tokens, `tailwind.config.ts`, `globals.css`, `components.json`, utilidades (`format.ts`, `status.ts`), componentes base y semánticos
- ✅ Etapa Frontend 4 — App Shell: sesión real, Zustand solo para establecimiento activo, React Query, navegación por rol, Sidebar/BottomNav/Header, login
- ✅ Etapa Frontend 5 — Dashboards por rol: 3 variantes reales, hueco de tiempo de abastecimiento cerrado
- ✅ Etapa Frontend 6 — Requerimientos (experiencia carrito): flujo completo, Drawer/QuantityInput/ProductCard/CartDrawer, toasts
- ✅ Etapa Frontend 7 — Bandeja de Compras + Pedidos por Proveedor
- ✅ Etapa Frontend 8 — Órdenes: hueco crítico de `status_history` RLS corregido, listado/detalle/nueva orden completos
- ✅ Etapa Frontend 9 — Recepción (mobile-first, prioridad alta)
- ✅ Etapa Frontend 10 — Facturas + ajuste de precio en conciliación agregado
- ✅ Etapa Frontend 11 — Productos: ficha 360° con gráficas (recharts), historial de precios, proveedor habitual editable + Categorías
- ✅ Etapa Frontend 12 — Proveedores: ficha 360° con `get_supplier_analysis` (backend nuevo)
- ✅ Etapa Frontend 13 — Analítica: gasto mensual, Pareto alternable, anomalías, tiempos
- ✅ Etapa Frontend 13b — Barra de filtros de Analítica sincronizada a la URL
- ✅ Etapa Frontend 14 — Reportes: Compras/Requerimientos, filtros, exportación CSV/XLSX
- ✅ Etapa Frontend 15 — Administración: Usuarios, Áreas, Unidades, Auditoría
- ✅ Etapa Frontend 16 — Responsive QA: 5 problemas de layout corregidos
- ✅ Etapa Frontend 17 — UX QA: hallazgo sistemático de error/vacío confundidos, corregido en 6 pantallas
- ✅ Etapa Frontend 18 — Performance y Accesibilidad (cierre del roadmap de frontend): `useDebouncedValue` (300ms) aplicado a los 2 buscadores que disparaban una consulta por tecla (Nuevo Requerimiento, Productos); `listProducts` limitado a 100 resultados por defecto con aviso visible, en vez de traer las ~1.000 referencias reales sin control; `htmlFor`/`id`/`aria-label` corregidos en `CartDrawer` y `ReceivingItem`. Balance honesto documentado: las 3 etapas de QA (16/17/18) fueron auditorías de código, no verificación real en dispositivo/navegador — se recomienda una pasada manual antes de producción ← este commit

**Con esto se completan las 18 etapas del roadmap de frontend, sumadas a las 18 fases de backend del proceso anterior. Gescomp queda con esquema completo + RLS, 12 flujos funcionales de punta a punta, y un frontend real conectado — con sus límites documentados explícitamente en cada etapa.**

## Auditoría técnica final y remediación P0/P1

- ✅ Auditoría técnica completa: 5 hallazgos P0 verificados por inspección real de código (no hipotéticos) — RLS con políticas escritas pero nunca habilitadas en 9 tablas (incluida `status_history`, abierta cross-establishment), 4 funciones `SECURITY DEFINER` sin `search_path`, `create_requisition_with_items` sin validar que el área perteneciera al establecimiento, `create_purchase_order_with_items` sin validar el establecimiento de las fuentes de trazabilidad, y 3 funciones de transición de estado que insertaban en `status_history` sin verificar si el `UPDATE` real había afectado alguna fila. Documento completo: `auditoria-tecnica-final-gescomp.md`.
- ✅ **SEC-001** (migración `0022`): RLS habilitado en las 9 tablas.
- ✅ **SEC-002** (migración `0023`): `search_path` fijado en las 4 funciones RLS.
- ✅ **DATA-001** (migración `0024`): validación de área↔establecimiento en la función y en las políticas RLS de `requisitions`.
- ✅ **DATA-002** (migración `0025`): validación de establecimiento en `purchase_order_item_sources`.
- ✅ **AUDIT-001** (migración `0026`): `GET DIAGNOSTICS` + excepción si el `UPDATE` afecta 0 filas, en `close_purchase_order`/`cancel_purchase_order`/`reconcile_invoice`.
- ✅ **P1** (migración `0027` + `format.ts`): política de `code_counters` (quedó bloqueada por la propia corrección de SEC-001), trigger de validación de unidad producto↔transacción, filtro de proveedor inactivo en `v_pedidos_por_proveedor`, `America/Bogota` fijado explícitamente en el formateo de fechas.
- ⏳ **Pendiente — requiere entorno real, no ejecutable desde aquí:** montar Supabase de staging, correr las 27 migraciones desde cero, ejecutar el script `pruebas-aislamiento-establecimientos.md` (7 pruebas concretas), luego la matriz E2E completa, luego QA visual real en navegador/celular, y solo entonces producción (Vercel + Supabase prod + dominio + PWA) — en ese orden, como se acordó.
- ⏳ Fase 9 en adelante — según roadmap acordado

## Nota sobre datos de demostración

Se arranca con datos ficticios (categorías, ~25 productos de ejemplo, proveedores y transacciones simuladas) para poder probar consolidación, precios, órdenes, recepciones y dashboards durante el desarrollo. La carga de las ~1.000 referencias reales se hace en el lanzamiento en vivo (import masivo), no antes — así el maestro real no se contamina con pruebas.
