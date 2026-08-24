-- ============================================================
-- GESCOMP — Migración inicial (Fase 6)
-- Deriva directamente del modelo de datos definido en Fase 2/3
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------- 1. Identidad y alcance ----------

create table establishments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nit text unique,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code in ('admin','coordinador_compras','cocina','bar','servicio')),
  name text not null
);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id),
  establishment_id uuid not null references establishments(id),
  created_at timestamptz not null default now(),
  unique (user_id, role_id, establishment_id)
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments(id),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  unique (establishment_id, code)
);

-- ---------- 2. Catálogos compartidos ----------

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order int,
  is_active boolean not null default true
);

create table subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  name text not null,
  unique (category_id, name)
);

create table units (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null
);

create table products (
  id uuid primary key default gen_random_uuid(),
  internal_code text unique,
  name text not null,
  description text,
  category_id uuid not null references categories(id),
  subcategory_id uuid references subcategories(id),
  unit_id uuid not null references units(id),
  preferred_brand text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_products_name_trgm on products using gin (name gin_trgm_ops);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  nit text unique,
  contact_name text,
  phone text,
  whatsapp text,
  email text,
  address text,
  payment_terms text,
  delivery_lead_time_days int,
  dispatch_days text[],
  min_order_value numeric,
  rating numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_suppliers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  supplier_id uuid not null references suppliers(id),
  establishment_id uuid not null references establishments(id),
  is_preferred boolean not null default false,
  unique (product_id, supplier_id, establishment_id)
);

-- ---------- 3. Requerimientos ----------

create table requisitions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  establishment_id uuid not null references establishments(id),
  area_id uuid not null references areas(id),
  requested_by uuid not null references users(id),
  status text not null default 'enviado' check (status in ('enviado','en_orden','cerrado','cancelado')),
  required_date date,
  notes text,
  created_at timestamptz not null default now(),
  unique (establishment_id, code)
);

create table requisition_items (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references requisitions(id) on delete cascade,
  product_id uuid references products(id),
  unregistered_product_name text,
  quantity numeric not null check (quantity > 0),
  unit_id uuid not null references units(id),
  priority text check (priority in ('normal','alta','urgente')),
  notes text,
  check (product_id is not null or unregistered_product_name is not null)
);
create index idx_requisition_items_requisition on requisition_items(requisition_id);
create index idx_requisition_items_product on requisition_items(product_id);

-- ---------- 4. Órdenes de compra/servicio ----------

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  establishment_id uuid not null references establishments(id),
  supplier_id uuid not null references suppliers(id),
  buyer_id uuid not null references users(id),
  type text not null check (type in ('producto','servicio')),
  status text not null default 'orden_generada',
  expected_delivery_date date,
  delivery_place text,
  subtotal numeric,
  tax_amount numeric,
  total numeric,
  pdf_attachment_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  unique (establishment_id, code)
);

create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid references products(id),
  service_description text,
  quantity numeric not null,
  unit_id uuid not null references units(id),
  estimated_unit_price numeric,
  agreed_unit_price numeric,
  line_total numeric
);

create table purchase_order_item_sources (
  id uuid primary key default gen_random_uuid(),
  purchase_order_item_id uuid not null references purchase_order_items(id) on delete cascade,
  requisition_item_id uuid not null references requisition_items(id),
  quantity_allocated numeric not null
);

-- ---------- 5. Recepción ----------

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id),
  establishment_id uuid not null references establishments(id),
  received_by uuid not null references users(id),
  delivery_date timestamptz not null default now(),
  is_partial boolean not null,
  notes text
);

create table delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references deliveries(id) on delete cascade,
  purchase_order_item_id uuid not null references purchase_order_items(id),
  quantity_received numeric not null,
  is_conforming boolean,
  difference_reason text,
  invoiced_unit_price numeric,
  photo_attachment_id uuid
);

-- ---------- 6. Precios ----------

create table price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  supplier_id uuid not null references suppliers(id),
  establishment_id uuid not null references establishments(id),
  unit_price numeric not null,
  unit_id uuid not null references units(id),
  source text not null check (source in ('recepcion','conciliacion','ajuste_manual')),
  purchase_order_id uuid references purchase_orders(id),
  delivery_id uuid references deliveries(id),
  invoice_id uuid,
  recorded_by uuid not null references users(id),
  recorded_at timestamptz not null default now(),
  notes text
);
create index idx_price_history_lookup on price_history(product_id, establishment_id, recorded_at desc);

-- ---------- 7. Facturas ----------

create table invoices (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments(id),
  purchase_order_id uuid not null references purchase_orders(id),
  supplier_id uuid not null references suppliers(id),
  invoice_number text not null,
  invoice_date date not null,
  subtotal numeric,
  discount numeric,
  tax_amount numeric,
  total numeric not null,
  file_attachment_id uuid,
  reconciled_by uuid references users(id),
  reconciled_at timestamptz,
  final_amount_to_pay numeric,
  unique (supplier_id, invoice_number)
);
alter table price_history add constraint fk_price_history_invoice foreign key (invoice_id) references invoices(id);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  purchase_order_item_id uuid not null references purchase_order_items(id),
  quantity_invoiced numeric not null,
  unit_price_invoiced numeric not null,
  line_total numeric
);

-- ---------- 8. Transversales ----------

create table status_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('requisition','purchase_order','delivery','invoice')),
  entity_id uuid not null,
  previous_status text,
  new_status text not null,
  changed_by uuid not null references users(id),
  changed_at timestamptz not null default now(),
  notes text
);
create index idx_status_history_entity on status_history(entity_type, entity_id);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  file_url text not null,
  file_type text,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now()
);
alter table purchase_orders add constraint fk_po_pdf foreign key (pdf_attachment_id) references attachments(id);
alter table delivery_items add constraint fk_delivery_photo foreign key (photo_attachment_id) references attachments(id);
alter table invoices add constraint fk_invoice_file foreign key (file_attachment_id) references attachments(id);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('precio_anormal','cantidad_anormal','frecuencia_anormal','proveedor_diferente','entrega_tardia','diferencia_recepcion','diferencia_factura')),
  establishment_id uuid not null references establishments(id),
  entity_type text,
  entity_id uuid,
  severity text check (severity in ('info','advertencia','critica')),
  message text not null,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert','update','soft_delete')),
  old_values jsonb,
  new_values jsonb,
  performed_by uuid not null references users(id),
  performed_at timestamptz not null default now()
);
create index idx_audit_logs_record on audit_logs(table_name, record_id);

-- ---------- 9. RLS: se habilita ahora, políticas se definen en Fase 7 ----------
alter table establishments enable row level security;
alter table users enable row level security;
alter table user_roles enable row level security;
alter table areas enable row level security;
alter table requisitions enable row level security;
alter table requisition_items enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
alter table deliveries enable row level security;
alter table delivery_items enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table price_history enable row level security;
alter table alerts enable row level security;
alter table audit_logs enable row level security;
-- Nota: sin políticas todavía, esto BLOQUEA todo acceso hasta la Fase 7.
-- Es intencional: preferible "cerrado por defecto" mientras no exista la capa de auth/roles.
