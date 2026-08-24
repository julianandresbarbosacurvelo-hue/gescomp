import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ArrowUp, ArrowDown } from 'lucide-react';

// Sección 42 del brief: "no usar semáforos permanentes, mostrar etiquetas destacadas
// solo cuando exista desviación real". No se renderiza si |percent| es insignificante.
export function DeviationBadge({
  percent, referenceLabel, threshold = 5,
}: { percent: number; referenceLabel: string; threshold?: number }) {
  if (Math.abs(percent) < threshold) return null;

  const isUp = percent > 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  // Un aumento no siempre es "malo" en términos absolutos de color, pero en compras
  // un aumento de precio sí es la lectura correcta por defecto.
  const color = isUp ? 'text-status-rojo bg-status-rojo/10' : 'text-status-verde bg-status-verde/10';

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', color)}>
      <Icon className="h-3 w-3" aria-hidden />
      {formatPercent(percent)} vs. {referenceLabel}
    </span>
  );
}
