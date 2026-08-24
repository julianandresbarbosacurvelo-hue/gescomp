'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ChevronDown, Download, Building2 } from 'lucide-react';
import { getConsolidatedRequisitionItems } from '@/lib/actions/requisitions';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { ErrorState } from '@/components/business/ErrorState';
import { StatusBadge } from '@/components/business/StatusBadge';
import { Button, buttonVariants } from '@/components/ui/button';
import { exportToCsv } from '@/lib/export';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';

type AreaBreakdown = { area_code: string; area_name: string; quantity: number; priority: string | null };

export default function BandejaCompras() {
  const { activeEstablishmentId } = useEstablishmentStore();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['consolidated-items', activeEstablishmentId],
    queryFn: () => getConsolidatedRequisitionItems(activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });

  const rowKey = (item: any) => item.product_id ?? `unregistered:${item.unregistered_product_name}`;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((i: any) => (i.product?.name ?? i.unregistered_product_name ?? '').toLowerCase().includes(q));
  }, [data, search]);

  function toggleSelect(key: string) {
    setSelected((s) => { const next = new Set(s); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }
  function toggleExpand(key: string) {
    setExpanded((s) => { const next = new Set(s); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }

  function handleExport() {
    const rows = filtered
      .filter((i: any) => selected.size === 0 || selected.has(rowKey(i)))
      .map((i: any) => ({
        producto: i.product?.name ?? i.unregistered_product_name,
        cantidad: i.total_quantity,
        unidad: i.unit?.code ?? '',
        areas: (i.breakdown_by_area as AreaBreakdown[]).map((a) => a.area_name).join(' / '),
        urgente: i.has_urgent ? 'Sí' : 'No',
      }));
    exportToCsv('bandeja-compras', rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Bandeja de Compras</h1>
          <p className="text-sm text-muted-foreground">Requerimientos consolidados, pendientes de convertir en orden</p>
        </div>
        <a href="/compras/pedidos-proveedor" className={buttonVariants({ variant: 'outline' })}>
          <Building2 className="h-4 w-4" /> Ver por proveedor
        </a>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-3 text-sm"
        />
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Inbox} title="No hay requerimientos pendientes" description="La bandeja está al día — no hay nada por consolidar." />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {filtered.map((item: any) => {
            const key = rowKey(item);
            const isExpanded = expanded.has(key);
            const areas = item.breakdown_by_area as AreaBreakdown[];
            return (
              <div key={key} className="border-b border-border last:border-0 bg-card">
                <div className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => toggleSelect(key)}
                    className="h-4 w-4 rounded border-input"
                    aria-label={`Seleccionar ${item.product?.name ?? item.unregistered_product_name}`}
                  />
                  <button onClick={() => toggleExpand(key)} className="flex flex-1 items-center justify-between gap-3 text-left min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.product?.name ?? item.unregistered_product_name}</p>
                      <p className="text-xs text-muted-foreground">{areas.length} área{areas.length === 1 ? '' : 's'} solicitante{areas.length === 1 ? '' : 's'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.has_urgent && <StatusBadge label="Urgente" color="rojo" />}
                      <span className="text-sm font-semibold tabular-nums">{item.total_quantity} {item.unit?.code}</span>
                      <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                    </div>
                  </button>
                </div>
                {isExpanded && (
                  <div className="bg-muted/40 px-4 py-2 pl-11">
                    {areas.map((a, i) => (
                      <div key={i} className="flex items-center justify-between py-1 text-sm">
                        <span className="text-muted-foreground">{a.area_name}</span>
                        <span className="tabular-nums">{a.quantity} {item.unit?.code}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Barra de acciones masivas — solo aparece con selección (sección 17 del brief) */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-card">
          <span className="text-sm font-medium">{selected.size} seleccionado{selected.size === 1 ? '' : 's'}</span>
          <Button size="sm" variant="outline" onClick={handleExport}><Download className="h-3.5 w-3.5" /> Exportar CSV</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}
