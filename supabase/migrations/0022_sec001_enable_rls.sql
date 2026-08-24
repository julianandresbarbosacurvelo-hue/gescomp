-- ============================================================
-- GESCOMP — Migración 0022: SEC-001 (P0)
--
-- ANTES: status_history, categories, subcategories, units, products,
-- suppliers, product_suppliers, purchase_order_item_sources y
-- code_counters tenían políticas de RLS escritas en migraciones
-- anteriores, pero `enable row level security` nunca se ejecutó sobre
-- esas tablas — las políticas eran letra muerta, las tablas estaban
-- efectivamente abiertas a cualquier rol autenticado.
--
-- CAMBIO: se habilita RLS en las 9 tablas. Solo eso — las políticas
-- ya existentes (creadas en 0002, 0005, 0017) empiezan a aplicarse
-- de inmediato con este solo comando, sin tocar su lógica.
--
-- IMPACTO: a partir de aquí, cualquier acceso a estas 9 tablas queda
-- sujeto a sus políticas ya escritas. `code_counters` es la excepción:
-- no tiene ninguna política, así que quedará COMPLETAMENTE BLOQUEADA
-- (ni siquiera `next_code()`, que corre `security invoker`, podrá
-- leerla/escribirla) hasta que se resuelva en la corrección P1
-- correspondiente (ver migración 0027). Esto es intencional: preferible
-- que next_code() falle de forma ruidosa a que code_counters quede sin
-- protección un solo día más.
--
-- PRUEBA: tras aplicar, conectarse con el cliente `anon`/`authenticated`
-- (nunca con la service role) y confirmar:
--   1. `select * from status_history limit 1;` sin sesión → 0 filas.
--   2. Con sesión de un usuario de Establecimiento A, `select * from
--      status_history` no debe traer filas de entidades de Establecimiento B.
--   3. `insert into products (...) values (...)` con un usuario rol
--      `cocina` debe fallar con error de política (antes de esta
--      migración, habría insertado sin problema).
--   4. Crear un requerimiento normal desde la UI (rol cocina) debe
--      seguir funcionando exactamente igual que antes — este cambio no
--      debería romper ningún flujo legítimo, solo cerrar accesos que
--      nunca debieron estar abiertos.
-- ============================================================

alter table status_history enable row level security;
alter table categories enable row level security;
alter table subcategories enable row level security;
alter table units enable row level security;
alter table products enable row level security;
alter table suppliers enable row level security;
alter table product_suppliers enable row level security;
alter table purchase_order_item_sources enable row level security;
alter table code_counters enable row level security;
