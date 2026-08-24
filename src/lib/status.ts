import type { LucideIcon } from 'lucide-react';
import {
  Clock, Inbox, Settings2, FileText, Send, CheckCircle2, Truck,
  PackageCheck, AlertTriangle, HandCoins, Lock, XCircle, Info, AlertOctagon,
} from 'lucide-react';

export type StatusColor = 'gris' | 'azul' | 'violeta' | 'naranja' | 'verde' | 'rojo' | 'verde-oscuro';

type StatusMeta = { label: string; color: StatusColor; icon: LucideIcon; priority: number };

// Estados de purchase_orders (máquina de estados definida en Fase 2/3 del backend).
export const PURCHASE_ORDER_STATUS: Record<string, StatusMeta> = {
  orden_generada: { label: 'Orden generada', color: 'violeta', icon: FileText, priority: 3 },
  enviada_al_proveedor: { label: 'Enviada al proveedor', color: 'violeta', icon: Send, priority: 3 },
  confirmada: { label: 'Confirmada', color: 'azul', icon: CheckCircle2, priority: 2 },
  recibida_parcialmente: { label: 'Recibida parcialmente', color: 'naranja', icon: Truck, priority: 4 },
  recibida_totalmente: { label: 'Recibida totalmente', color: 'verde', icon: PackageCheck, priority: 1 },
  con_novedad: { label: 'Con novedad', color: 'rojo', icon: AlertTriangle, priority: 5 },
  conciliada: { label: 'Conciliada', color: 'verde', icon: HandCoins, priority: 1 },
  cerrada: { label: 'Cerrada', color: 'verde-oscuro', icon: Lock, priority: 0 },
  cancelada: { label: 'Cancelada', color: 'gris', icon: XCircle, priority: 0 },
};

// Estados de requisitions.
export const REQUISITION_STATUS: Record<string, StatusMeta> = {
  enviado: { label: 'Enviado', color: 'gris', icon: Inbox, priority: 3 },
  en_orden: { label: 'En orden', color: 'azul', icon: Settings2, priority: 2 },
  cerrado: { label: 'Cerrado', color: 'verde-oscuro', icon: Lock, priority: 0 },
  cancelado: { label: 'Cancelado', color: 'gris', icon: XCircle, priority: 0 },
};

// Severidad de alerts.
export const ALERT_SEVERITY: Record<string, StatusMeta> = {
  info: { label: 'Info', color: 'azul', icon: Info, priority: 1 },
  advertencia: { label: 'Advertencia', color: 'naranja', icon: AlertTriangle, priority: 2 },
  critica: { label: 'Crítica', color: 'rojo', icon: AlertOctagon, priority: 3 },
};

// Tipos de alerta → etiqueta legible (los 7 tipos del backend, Fase 15).
export const ALERT_TYPE_LABEL: Record<string, string> = {
  precio_anormal: 'Precio anormal',
  cantidad_anormal: 'Cantidad inusual',
  frecuencia_anormal: 'Frecuencia inusual',
  proveedor_diferente: 'Proveedor diferente',
  entrega_tardia: 'Entrega atrasada',
  diferencia_recepcion: 'Diferencia en recepción',
  diferencia_factura: 'Diferencia de factura',
};

// Mapa de color de estado → clases Tailwind (dot + texto), centralizado para que
// "Con novedad" se vea IGUAL en todos los módulos (sección 84 del brief).
export const STATUS_COLOR_CLASSES: Record<StatusColor, { dot: string; text: string; bg: string }> = {
  gris: { dot: 'bg-status-gris', text: 'text-status-gris', bg: 'bg-status-gris/10' },
  azul: { dot: 'bg-status-azul', text: 'text-status-azul', bg: 'bg-status-azul/10' },
  violeta: { dot: 'bg-status-violeta', text: 'text-status-violeta', bg: 'bg-status-violeta/10' },
  naranja: { dot: 'bg-status-naranja', text: 'text-status-naranja', bg: 'bg-status-naranja/10' },
  verde: { dot: 'bg-status-verde', text: 'text-status-verde', bg: 'bg-status-verde/10' },
  rojo: { dot: 'bg-status-rojo', text: 'text-status-rojo', bg: 'bg-status-rojo/10' },
  'verde-oscuro': { dot: 'bg-status-verde-oscuro', text: 'text-status-verde-oscuro', bg: 'bg-status-verde-oscuro/10' },
};

export function getPurchaseOrderStatusMeta(status: string): StatusMeta {
  return PURCHASE_ORDER_STATUS[status] ?? { label: status, color: 'gris', icon: Clock, priority: 0 };
}
export function getRequisitionStatusMeta(status: string): StatusMeta {
  return REQUISITION_STATUS[status] ?? { label: status, color: 'gris', icon: Clock, priority: 0 };
}
export function getAlertSeverityMeta(severity: string): StatusMeta {
  return ALERT_SEVERITY[severity] ?? { label: severity, color: 'gris', icon: Info, priority: 0 };
}
