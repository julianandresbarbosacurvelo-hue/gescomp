-- ============================================================
-- GESCOMP — Migración 0003: Datos de demostración (Fase 8)
-- Ficticios, para probar consolidación, precios, órdenes,
-- recepciones y dashboards durante el desarrollo.
-- ============================================================

-- ---------- Establecimientos ----------
insert into establishments (id, name, nit, address) values
  ('11111111-1111-1111-1111-111111111111', 'Gescomp Sede Bogotá', '900123456-1', 'Cra 15 #85-20, Bogotá'),
  ('22222222-2222-2222-2222-222222222222', 'Gescomp Sede Medellín', '900123456-2', 'Cl 10 #40-15, Medellín');

-- ---------- Roles ----------
insert into roles (code, name) values
  ('admin','Administrador'),
  ('coordinador_compras','Coordinador de Compras'),
  ('cocina','Cocina'),
  ('bar','Bar'),
  ('servicio','Servicio');

-- ---------- Áreas (una por código, por establecimiento) ----------
insert into areas (establishment_id, code, name) values
  ('11111111-1111-1111-1111-111111111111','cocina','Cocina'),
  ('11111111-1111-1111-1111-111111111111','bar','Bar'),
  ('11111111-1111-1111-1111-111111111111','servicio','Servicio'),
  ('22222222-2222-2222-2222-222222222222','cocina','Cocina'),
  ('22222222-2222-2222-2222-222222222222','bar','Bar'),
  ('22222222-2222-2222-2222-222222222222','servicio','Servicio');

-- ---------- Unidades ----------
insert into units (code, name) values
  ('kg','Kilogramo'), ('g','Gramo'), ('lt','Litro'), ('ml','Mililitro'),
  ('und','Unidad'), ('caja','Caja'), ('paquete','Paquete'), ('gal','Galón'), ('bolsa','Bolsa');

-- ---------- Categorías ----------
insert into categories (name, display_order) values
  ('Carnes',1),('Pescados y mariscos',2),('Frutas y verduras',3),('Lácteos',4),
  ('Abarrotes',5),('Bebidas',6),('Licores',7),('Panadería',8),
  ('Desechables',9),('Productos de aseo',10);

-- ---------- Proveedores ----------
insert into suppliers (id, legal_name, trade_name, nit, contact_name, phone, delivery_lead_time_days, dispatch_days) values
  ('a1111111-0000-0000-0000-000000000001','Carnes Premium S.A.S','Carnes Premium','900111222-1','Jorge Salinas','3101234567',1,'{lun,mié,vie}'),
  ('a1111111-0000-0000-0000-000000000002','Frutas del Llano Ltda','Frutas del Llano','900111222-2','Marcela Torres','3117654321',1,'{lun,mar,mié,jue,vie}'),
  ('a1111111-0000-0000-0000-000000000003','Lácteos La Sabana','Lácteos La Sabana','900111222-3','Andrés Rojas','3129876543',2,'{lun,jue}'),
  ('a1111111-0000-0000-0000-000000000004','Distribuciones Abarrotes JR','Abarrotes JR','900111222-4','Julián Ramírez','3135554433',3,'{mar,vie}'),
  ('a1111111-0000-0000-0000-000000000005','Aseo Total Colombia','Aseo Total','900111222-5','Paola Núñez','3148889977',3,'{mié}');

-- ---------- Productos (25 referencias) ----------
-- Carnes
insert into products (id, internal_code, name, category_id, unit_id, is_active)
select 'b0000000-0000-0000-0000-000000000001','CAR-001','Lomo fino', c.id, u.id, true
from categories c, units u where c.name='Carnes' and u.code='kg';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000002','CAR-002','Pechuga de pollo', c.id, u.id
from categories c, units u where c.name='Carnes' and u.code='kg';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000003','CAR-003','Costilla de res', c.id, u.id
from categories c, units u where c.name='Carnes' and u.code='kg';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000004','CAR-004','Chorizo santarrosano', c.id, u.id
from categories c, units u where c.name='Carnes' and u.code='kg';
-- Pescados y mariscos
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000005','PES-001','Filete de tilapia', c.id, u.id
from categories c, units u where c.name='Pescados y mariscos' and u.code='kg';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000006','PES-002','Camarón pelado', c.id, u.id
from categories c, units u where c.name='Pescados y mariscos' and u.code='kg';
-- Frutas y verduras
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000007','FRV-001','Tomate chonto', c.id, u.id
from categories c, units u where c.name='Frutas y verduras' and u.code='kg';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000008','FRV-002','Cebolla cabezona', c.id, u.id
from categories c, units u where c.name='Frutas y verduras' and u.code='kg';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000009','FRV-003','Aguacate hass', c.id, u.id
from categories c, units u where c.name='Frutas y verduras' and u.code='kg';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000010','FRV-004','Limón tahití', c.id, u.id
from categories c, units u where c.name='Frutas y verduras' and u.code='kg';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000011','FRV-005','Papa criolla', c.id, u.id
from categories c, units u where c.name='Frutas y verduras' and u.code='kg';
-- Lácteos
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000012','LAC-001','Queso mozzarella', c.id, u.id
from categories c, units u where c.name='Lácteos' and u.code='kg';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000013','LAC-002','Leche entera', c.id, u.id
from categories c, units u where c.name='Lácteos' and u.code='lt';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000014','LAC-003','Crema de leche', c.id, u.id
from categories c, units u where c.name='Lácteos' and u.code='lt';
-- Abarrotes
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000015','ABA-001','Arroz blanco', c.id, u.id
from categories c, units u where c.name='Abarrotes' and u.code='kg';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000016','ABA-002','Aceite vegetal', c.id, u.id
from categories c, units u where c.name='Abarrotes' and u.code='lt';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000017','ABA-003','Sal refinada', c.id, u.id
from categories c, units u where c.name='Abarrotes' and u.code='kg';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000018','ABA-004','Pasta spaghetti', c.id, u.id
from categories c, units u where c.name='Abarrotes' and u.code='kg';
-- Bebidas
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000019','BEB-001','Gaseosa cola 1.5L', c.id, u.id
from categories c, units u where c.name='Bebidas' and u.code='und';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000020','BEB-002','Agua sin gas 600ml', c.id, u.id
from categories c, units u where c.name='Bebidas' and u.code='und';
-- Licores
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000021','LIC-001','Ron añejo 750ml', c.id, u.id
from categories c, units u where c.name='Licores' and u.code='und';
-- Panadería
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000022','PAN-001','Pan campesino', c.id, u.id
from categories c, units u where c.name='Panadería' and u.code='und';
-- Desechables
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000023','DES-001','Vaso desechable 8oz', c.id, u.id
from categories c, units u where c.name='Desechables' and u.code='paquete';
-- Aseo
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000024','ASE-001','Detergente multiusos', c.id, u.id
from categories c, units u where c.name='Productos de aseo' and u.code='gal';
insert into products (id, internal_code, name, category_id, unit_id)
select 'b0000000-0000-0000-0000-000000000025','ASE-002','Jabón lavaloza', c.id, u.id
from categories c, units u where c.name='Productos de aseo' and u.code='lt';

-- ---------- Relación producto-proveedor (habitual) por establecimiento ----------
insert into product_suppliers (product_id, supplier_id, establishment_id, is_preferred)
select p.id, 'a1111111-0000-0000-0000-000000000001', e.id, true
from products p, establishments e where p.internal_code like 'CAR-%';
insert into product_suppliers (product_id, supplier_id, establishment_id, is_preferred)
select p.id, 'a1111111-0000-0000-0000-000000000002', e.id, true
from products p, establishments e where p.internal_code like 'FRV-%' or p.internal_code like 'PES-%';
insert into product_suppliers (product_id, supplier_id, establishment_id, is_preferred)
select p.id, 'a1111111-0000-0000-0000-000000000003', e.id, true
from products p, establishments e where p.internal_code like 'LAC-%';
insert into product_suppliers (product_id, supplier_id, establishment_id, is_preferred)
select p.id, 'a1111111-0000-0000-0000-000000000004', e.id, true
from products p, establishments e where p.internal_code like 'ABA-%' or p.internal_code like 'BEB-%' or p.internal_code like 'LIC-%' or p.internal_code like 'PAN-%' or p.internal_code like 'DES-%';
insert into product_suppliers (product_id, supplier_id, establishment_id, is_preferred)
select p.id, 'a1111111-0000-0000-0000-000000000005', e.id, true
from products p, establishments e where p.internal_code like 'ASE-%';

-- NOTA: usuarios (auth.users) y user_roles NO se siembran aquí —
-- requieren cuentas reales creadas vía Supabase Auth (signup o invitación desde el panel).
-- Después de crear cada usuario en Auth, insertar su fila en `users` y en `user_roles`
-- apuntando al establecimiento y rol correspondiente para que las políticas RLS funcionen.
