'use client';

import { Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ProductCard({
  name, unitCode, inCart, onAdd,
}: { name: string; unitCode?: string; inCart: boolean; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-3 text-left transition-colors',
        inCart ? 'border-primary/40 bg-accent' : 'hover:bg-accent'
      )}
    >
      <div className="min-w-0">
        {/* Antes usaba `truncate` (una sola línea + "...") — con nombres largos de
            producto (ej. "Queso Tajado Quesillo Doble Crema x 500gr") el usuario no
            podía leer qué estaba agregando ni distinguirlo de otro similar. Se
            reemplaza por `break-words` para que el nombre haga wrap a varias líneas
            y siempre se lea completo, en vez de cortarse. */}
        <p className="text-sm font-medium break-words">{name}</p>
        {unitCode && <p className="text-xs text-muted-foreground">Unidad: {unitCode}</p>}
      </div>
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          inCart ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {inCart ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </span>
    </button>
  );
}
