# FASE 18 — Puesta en Producción

## 1. Checklist de despliegue

- [ ] Crear proyecto en **Supabase** (nombre: Gescomp) y ejecutar, en orden, los 14 archivos de
      `supabase/migrations/` (`0001` a `0014`). El orden importa: cada migración depende de que
      la anterior ya haya corrido.
- [ ] Crear los dos buckets de Storage si no quedaron creados por las migraciones 0006/0007:
      `ordenes-pdf` y `evidencias-recepcion` (ambos públicos de lectura, ver políticas ya incluidas).
- [ ] Crear las cuentas reales en **Supabase Auth** para cada persona del equipo (admin,
      coordinador de compras, y un usuario por área en cada sede) e insertar su fila en
      `users` + `user_roles` apuntando al establecimiento y rol correspondiente.
- [ ] Repositorio en **GitHub**, conectado a **Vercel**.
- [ ] Variables de entorno en Vercel (mismas de `.env.local.example`): `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (marcada como secreta,
      nunca expuesta al cliente), `SUPABASE_PROJECT_ID`.
- [ ] Verificar en el dashboard de Supabase que **RLS está habilitado** en todas las tablas
      listadas en la Fase 6/7 (`select relname, relrowsecurity from pg_class where relkind='r'`).
- [ ] Ejecutar el **plan de QA de la Fase 17** contra el proyecto real, con un usuario por rol.
- [ ] Confirmar que **ningún dato ficticio de demostración se mezcla con datos reales** — la
      decisión que tomaste fue: demo primero, import masivo de las ~1.000 referencias reales
      recién en el lanzamiento. Si el lanzamiento ya es inminente, considera limpiar los datos
      de la migración 0003 (`delete from products where internal_code like '___-0__'` como
      referencia, ajustando al criterio real) antes de cargar el maestro definitivo.

## 2. Import masivo de las ~1.000 referencias reales

Cuando llegue el momento (según tu decisión de la Fase 4/5), el camino más simple es:
1. Exportar tu maestro actual a CSV con columnas equivalentes a `products` (nombre, categoría,
   unidad, código interno, marca preferida).
2. Cargar categorías y unidades que falten primero (son catálogos pequeños, se pueden crear a mano
   o con un script corto).
3. Importar productos vía el SQL Editor de Supabase (`copy products (...) from stdin` o el
   importador CSV nativo del Table Editor) o con un script Node que reutilice `createProduct`
   ítem por ítem si prefieres que pase por la validación Zod.
4. Crear las relaciones `product_suppliers` (proveedor habitual) para cada producto — es el
   paso que más vale la pena hacer con cuidado, porque de ahí sale automáticamente la
   "Bandeja por Proveedor" desde el primer día.

## 3. Pendientes conocidos, fuera del alcance de este MVP

Quedaron explícitamente para después, tal como se acordó en la Fase 1 (sección 42):

- **Inventarios** (kardex, existencias, conteos físicos)
- **Recetas y Food Cost** (costo teórico vs. real)
- **Mermas** (desperdicio, vencimiento, devoluciones)
- **POS** (integración con ventas)
- **IA para OCR de facturas** (hoy la factura se registra manualmente)
- **Predicción de compras** (sugerencias automáticas de cuándo comprar)
- **Control presupuestal** (presupuesto por mes/área/categoría)
- **PWA instalable** (hoy es responsive, no instalable como app)
- **Notificaciones** (push/WhatsApp/correo) — hoy las alertas viven solo dentro de la app

Ninguno de estos requiere rediseñar lo ya construido — la arquitectura de la Fase 2
(multi-establecimiento, histórico de precios, trazabilidad completa) se pensó justamente para
que estas capas se agreguen encima sin migrar lo existente.

## 4. Estado final del roadmap

Con esto se completan las 18 fases de tu documento original. El proyecto **Gescomp** queda con:
esquema de base de datos completo (14 migraciones), RLS por rol/establecimiento/área, los 12
flujos funcionales (requerimiento → consolidación → orden → PDF → recepción → factura →
three-way match → conciliación → cierre), 7 tipos de detección de anomalías, dashboard
ejecutivo, analítica de producto y ABC/Pareto, auditoría automática, y un plan de QA ejecutado
sobre el propio código (que ya encontró y corrigió dos huecos reales antes de llegar a producción).
