import { cn } from '@/lib/utils';
import { STATUS_COLOR_CLASSES, type StatusColor } from '@/lib/status';
import type { LucideIcon } from 'lucide-react';

// Componente ÚNICO para cualquier estado del sistema — órdenes, requerimientos, alertas.
// No crear OrderStatusBadge/RequisitionStatusBadge por separado (sección 85 del brief):
// cada dominio le pasa su propio label/color/icon ya resuelto por src/lib/status.ts.
export function StatusBadge({
  label, color, icon: Icon, className,
}: { label: string; color: StatusColor; icon?: LucideIcon; className?: string }) {
  const classes = STATUS_COLOR_CLASSES[color];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        classes.bg, classes.text, className
      )}
    >
      {/* Nunca depender solo del color (accesibilidad, sección 80): icono + texto siempre */}
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : <span className={cn('h-1.5 w-1.5 rounded-full', classes.dot)} />}
      {label}
    </span>
  );
}
