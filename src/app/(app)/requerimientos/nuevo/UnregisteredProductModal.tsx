'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listUnits } from '@/lib/actions/units';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function UnregisteredProductModal({
  open, onClose, onAdd,
}: { open: boolean; onClose: () => void; onAdd: (name: string, unitId: string, unitCode: string, quantity: number) => void }) {
  const [name, setName] = useState('');
  const [unitId, setUnitId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const { data: units } = useQuery({ queryKey: ['units'], queryFn: listUnits, enabled: open });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Producto no registrado" className="relative w-full max-w-sm rounded-lg bg-card p-5 shadow-card">
        <h2 className="font-display text-base font-semibold mb-1">Producto no registrado</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Se solicitará igual, y quedará pendiente de que compras lo formalice en el catálogo.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Nombre del producto</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Especias mixtas marca X" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Unidad</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="">Selecciona una unidad</option>
              {units?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Cantidad aproximada</label>
            <Input type="number" min={0.5} step={0.5} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>
        </div>

        <div className="mt-5 flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!name.trim() || !unitId || quantity <= 0}
            onClick={() => {
              const unit = units?.find((u) => u.id === unitId);
              onAdd(name.trim(), unitId, unit?.code ?? '', quantity);
              setName(''); setUnitId(''); setQuantity(1);
              onClose();
            }}
          >
            Agregar al carrito
          </Button>
        </div>
      </div>
    </div>
  );
}
