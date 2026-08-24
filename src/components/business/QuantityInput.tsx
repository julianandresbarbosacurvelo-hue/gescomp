'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function QuantityInput({
  value, onChange, unitCode, min = 0.5, step = 0.5, className,
}: { value: number; onChange: (v: number) => void; unitCode?: string; min?: number; step?: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-accent"
        aria-label="Disminuir cantidad"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="flex h-8 min-w-[4.5rem] items-center justify-center rounded-md border border-input px-2 text-sm font-medium tabular-nums">
        {value} {unitCode && <span className="ml-1 text-muted-foreground">{unitCode}</span>}
      </div>
      <button
        type="button"
        onClick={() => onChange(Number((value + step).toFixed(2)))}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-accent"
        aria-label="Aumentar cantidad"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
