import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

// Firma visual del Design System (Etapa 3): borde superior en `copper`, sin fondo de color
// ni ícono decorativo grande — referencia discreta al menaje de cocina profesional.
export function KpiCard({
  label, value, delta, icon: Icon, className,
}: {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-5 shadow-card border-t-2 border-t-primary', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" aria-hidden /> : null}
      </div>
      <div className="mt-2 font-display text-2xl font-semibold text-foreground">{value}</div>
      {delta ? (
        <div className={cn('mt-1 text-xs font-medium', delta.positive ? 'text-status-verde' : 'text-status-rojo')}>
          {delta.value}
        </div>
      ) : null}
    </div>
  );
}
