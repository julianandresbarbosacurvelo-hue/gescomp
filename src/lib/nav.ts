import {
  LayoutDashboard, ClipboardList, ShoppingCart, FileText, Truck,
  Package, Tags, Building2, Receipt, AlertTriangle, BarChart3,
  Users, MapPin, Ruler, ScrollText, PlusCircle, Inbox, PackageCheck, Building,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavItem = { label: string; href: string; icon: LucideIcon; roles: string[] };
export type NavGroup = { label: string; items: NavItem[] };

const ALL_ROLES = ['admin', 'coordinador_compras', 'cocina', 'bar', 'servicio'];
const AREA_ROLES = ['cocina', 'bar', 'servicio'];
const BUYER_ROLES = ['admin', 'coordinador_compras'];

// Sidebar desktop — agrupada exactamente como se definió en la Etapa 2 (IA).
export const SIDEBAR_GROUPS: NavGroup[] = [
  { label: 'Inicio', items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ALL_ROLES }] },
  {
    label: 'Operación',
    items: [
      { label: 'Nuevo requerimiento', href: '/requerimientos/nuevo', icon: PlusCircle, roles: AREA_ROLES },
      { label: 'Mis requerimientos', href: '/requerimientos/mis-requerimientos', icon: ClipboardList, roles: AREA_ROLES },
      { label: 'Bandeja de compras', href: '/compras/bandeja', icon: Inbox, roles: BUYER_ROLES },
      { label: 'Pedidos por proveedor', href: '/compras/pedidos-proveedor', icon: ShoppingCart, roles: BUYER_ROLES },
      { label: 'Órdenes', href: '/compras/ordenes', icon: FileText, roles: BUYER_ROLES },
      { label: 'Recepciones', href: '/recepcion', icon: Truck, roles: ALL_ROLES },
    ],
  },
  {
    label: 'Abastecimiento',
    items: [
      { label: 'Productos', href: '/productos', icon: Package, roles: BUYER_ROLES },
      { label: 'Categorías', href: '/categorias', icon: Tags, roles: BUYER_ROLES },
      { label: 'Proveedores', href: '/proveedores', icon: Building2, roles: BUYER_ROLES },
      // Movida desde "Administración": RLS de `units` ya permite admin y
      // coordinador_compras por igual, y conceptualmente encaja mejor junto
      // al resto del catálogo de abastecimiento que como ítem administrativo.
      { label: 'Unidades', href: '/admin/unidades', icon: Ruler, roles: BUYER_ROLES },
    ],
  },
  {
    label: 'Control',
    items: [
      { label: 'Facturas', href: '/facturas', icon: Receipt, roles: BUYER_ROLES },
      { label: 'Alertas', href: '/alertas', icon: AlertTriangle, roles: BUYER_ROLES },
    ],
  },
  {
    label: 'Análisis',
    items: [
      { label: 'Analítica', href: '/analitica', icon: BarChart3, roles: BUYER_ROLES },
      { label: 'Reportes', href: '/reportes', icon: BarChart3, roles: BUYER_ROLES },
    ],
  },
  {
    label: 'Administración',
    items: [
      { label: 'Usuarios', href: '/admin/usuarios', icon: Users, roles: ['admin'] },
      { label: 'Áreas', href: '/admin/areas', icon: MapPin, roles: ['admin'] },
      { label: 'Establecimientos', href: '/admin/establecimientos', icon: Building, roles: ['admin'] },
      { label: 'Auditoría', href: '/admin/auditoria', icon: ScrollText, roles: ['admin'] },
    ],
  },
];

// Bottom nav móvil — máximo 4-5 destinos, distinto según el rol (sección 9 del brief).
export function getBottomNavItems(roleCodes: string[]): NavItem[] {
  const isBuyer = roleCodes.some((r) => BUYER_ROLES.includes(r));

  if (isBuyer) {
    return [
      { label: 'Inicio', href: '/dashboard', icon: LayoutDashboard, roles: ALL_ROLES },
      { label: 'Bandeja', href: '/compras/bandeja', icon: Inbox, roles: BUYER_ROLES },
      { label: 'Recibir', href: '/recepcion', icon: PackageCheck, roles: ALL_ROLES },
      { label: 'Alertas', href: '/alertas', icon: AlertTriangle, roles: BUYER_ROLES },
    ];
  }

  return [
    { label: 'Inicio', href: '/dashboard', icon: LayoutDashboard, roles: ALL_ROLES },
    { label: 'Solicitar', href: '/requerimientos/nuevo', icon: PlusCircle, roles: AREA_ROLES },
    { label: 'Mis pedidos', href: '/requerimientos/mis-requerimientos', icon: ClipboardList, roles: AREA_ROLES },
    { label: 'Recibir', href: '/recepcion', icon: PackageCheck, roles: ALL_ROLES },
  ];
}

export function filterGroupsByRole(groups: NavGroup[], roleCodes: string[]): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.some((r) => roleCodes.includes(r))) }))
    .filter((g) => g.items.length > 0);
}
