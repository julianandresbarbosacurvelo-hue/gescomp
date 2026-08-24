'use client';

import { Drawer } from '@/components/ui/drawer';
import { QuantityInput } from '@/components/business/QuantityInput';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { CartItem } from './cart-types';

export function CartDrawer({
  open, onClose, items, onUpdateItem, onRemoveItem,
  requiredDate, onRequiredDateChange, notes, onNotesChange,
  onSubmit, submitting,
}: {
  open: boolean; onClose: () => void; items: CartItem[];
  onUpdateItem: (key: string, patch: Partial<CartItem>) => void;
  onRemoveItem: (key: string) => void;
  requiredDate: string; onRequiredDateChange: (v: string) => void;
  notes: string; onNotesChange: (v: string) => void;
  onSubmit: () => void; submitting: boolean;
}) {
  return (
    <Drawer open={open} onClose={onClose} title={`Carrito · ${items.length} producto${items.length === 1 ? '' : 's'}`} side="bottom">
      <div className="p-4 space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Aún no has agregado productos.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.key} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <label className="sr-only" htmlFor={`priority-${item.key}`}>Prioridad de {item.name}</label>
                  <select
                    id={`priority-${item.key}`}
                    value={item.priority ?? 'normal'}
                    onChange={(e) => onUpdateItem(item.key, { priority: e.target.value as CartItem['priority'] })}
                    className="mt-1 text-xs bg-transparent text-muted-foreground focus-visible:outline-none"
                  >
                    <option value="normal">Prioridad normal</option>
                    <option value="alta">Prioridad alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <QuantityInput
                  value={item.quantity}
                  onChange={(v) => onUpdateItem(item.key, { quantity: v })}
                  unitCode={item.unit_code}
                />
                <button
                  onClick={() => onRemoveItem(item.key)}
                  className="text-muted-foreground hover:text-destructive p-1.5"
                  aria-label={`Quitar ${item.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 pt-2 border-t border-border">
          <div>
            <label className="block text-sm font-medium mb-1.5">Fecha requerida (opcional)</label>
            <input
              type="date"
              value={requiredDate}
              onChange={(e) => onRequiredDateChange(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Observaciones (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Sticky CTA (sección 66 del brief) */}
      <div className="sticky bottom-0 border-t border-border bg-card p-4">
        <Button size="lg" className="w-full" disabled={items.length === 0 || submitting} onClick={onSubmit}>
          {submitting ? 'Enviando…' : 'Enviar requerimiento'}
        </Button>
      </div>
    </Drawer>
  );
}
