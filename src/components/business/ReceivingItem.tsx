'use client';

import { useQuery } from '@tanstack/react-query';
import { Camera, AlertTriangle } from 'lucide-react';
import { QuantityInput } from '@/components/business/QuantityInput';
import { StatusBadge } from '@/components/business/StatusBadge';
import { getProductPriceSummary } from '@/lib/actions/products';
import { DeviationBadge } from '@/components/business/DeviationBadge';
import { formatCurrencyCOP } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ReceivingItemState } from './receiving-types';

const NOVEDAD_REASONS = [
  { value: 'faltante', label: 'Faltante' },
  { value: 'excedente', label: 'Excedente' },
  { value: 'producto_equivocado', label: 'Producto equivocado' },
  { value: 'calidad', label: 'Calidad' },
  { value: 'temperatura', label: 'Temperatura' },
  { value: 'daño', label: 'Daño' },
  { value: 'vencimiento', label: 'Vencimiento' },
  { value: 'precio', label: 'Precio' },
  { value: 'otro', label: 'Otro' },
];

export function ReceivingItem({
  item, establishmentId, onChange,
}: { item: ReceivingItemState; establishmentId: string; onChange: (patch: Partial<ReceivingItemState>) => void }) {
  const isPartial = item.quantity_received < item.pending;
  const isExcess = item.quantity_received > item.pending;

  const priceSummary = useQuery({
    queryKey: ['product-price-summary', item.product_id, establishmentId],
    queryFn: () => getProductPriceSummary(item.product_id!, establishmentId),
    enabled: item.showPriceInput && !!item.product_id,
  });

  const variationPct =
    priceSummary.data?.lastPrice && item.invoiced_unit_price
      ? ((item.invoiced_unit_price - Number(priceSummary.data.lastPrice.unit_price)) / Number(priceSummary.data.lastPrice.unit_price)) * 100
      : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">Ordenado: {item.ordered} {item.unit_code} · Pendiente: {item.pending} {item.unit_code}</p>
        </div>
        {isPartial && item.quantity_received > 0 && <StatusBadge label="Recepción parcial" color="naranja" />}
        {isExcess && <StatusBadge label="Excedente" color="rojo" />}
      </div>

      <QuantityInput
        value={item.quantity_received}
        onChange={(v) => onChange({ quantity_received: v })}
        unitCode={item.unit_code}
        min={0}
        step={1}
        className="justify-center"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange({ quantity_received: item.pending, hasNovedad: false })}
          className={cn(
            'flex-1 rounded-md py-2 text-sm font-medium',
            item.quantity_received === item.pending && !item.hasNovedad
              ? 'bg-status-verde/10 text-status-verde'
              : 'bg-muted text-foreground hover:bg-accent'
          )}
        >
          Completar
        </button>
        <button
          type="button"
          onClick={() => onChange({ hasNovedad: !item.hasNovedad })}
          className={cn(
            'flex-1 rounded-md py-2 text-sm font-medium flex items-center justify-center gap-1.5',
            item.hasNovedad ? 'bg-status-rojo/10 text-status-rojo' : 'bg-muted text-foreground hover:bg-accent'
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Novedad
        </button>
      </div>

      {item.hasNovedad && (
        <div className="space-y-2 rounded-md bg-muted/50 p-3">
          <label className="sr-only" htmlFor={`novedad-reason-${item.purchase_order_item_id}`}>Motivo de la novedad para {item.name}</label>
          <select
            id={`novedad-reason-${item.purchase_order_item_id}`}
            value={item.difference_reason ?? ''}
            onChange={(e) => onChange({ difference_reason: e.target.value })}
            className="w-full h-9 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="">Selecciona un motivo</option>
            {NOVEDAD_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-2 text-sm text-muted-foreground cursor-pointer hover:bg-accent">
            <Camera className="h-4 w-4" />
            {item.photoFile ? item.photoFile.name : 'Adjuntar foto'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onChange({ photoFile: e.target.files?.[0] })}
            />
          </label>
        </div>
      )}

      {/* Precio al recibir — opcional, sección 34 del brief */}
      <div>
        <button
          type="button"
          onClick={() => onChange({ showPriceInput: !item.showPriceInput })}
          className="text-xs font-medium text-primary hover:underline"
        >
          {item.showPriceInput ? 'Ocultar precio de factura' : '¿Tienes la factura? Registrar precio'}
        </button>
        {item.showPriceInput && (
          <div className="mt-2 space-y-1.5">
            <input
              type="number"
              placeholder="Precio unitario de la factura"
              aria-label={`Precio unitario de factura para ${item.name}`}
              value={item.invoiced_unit_price ?? ''}
              onChange={(e) => onChange({ invoiced_unit_price: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full h-9 rounded-md border border-input bg-card px-2 text-sm"
            />
            {priceSummary.data?.lastPrice && item.invoiced_unit_price != null && variationPct !== null && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Anterior: {formatCurrencyCOP(Number(priceSummary.data.lastPrice.unit_price))}</span>
                <DeviationBadge percent={variationPct} referenceLabel="último precio" threshold={1} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
