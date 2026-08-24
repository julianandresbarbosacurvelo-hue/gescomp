'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { listPurchaseOrders } from '@/lib/actions/purchase-orders';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { StatusBadge } from '@/components/business/StatusBadge';
import { CurrencyDisplay, DateTimeDisplay } from '@/components/business/DisplayFormatters';
import { getPurchaseOrderStatusMeta } from '@/lib/status';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'orden_generada', label: 'Generadas' },
  { value: 'atrasada', label: 'Atrasadas' },
  { value: 'con_novedad', label: 'Con novedad' },
  { value: 'cerrada', label: 'Cerradas' },
];

export default function OrdenesPage() {
  const { activeEstablishmentId } = useEstablishmentStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const statusFilter = searchParams.get('status') ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', activeEstablishmentId],
    queryFn: () => listPurchaseOrders(activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!statusFilter) return data;
    if (statusFilter === 'atrasada') {
      return data.filter(
        (o: any) => o.expected_delivery_date && new Date(o.expected_delivery_date) < new Date() &&
          !['recibida_totalmente', 'con_novedad', 'conciliada', 'cerrada', 'cancelada'].includes(o.status)
      );
    }
    return data.filter((o: any) => o.status === statusFilter);
  }, [data, statusFilter]);

  function setFilter(value: string) {
    const params = new URLSearchParams(searchParams);
    value ? params.set('status', value) : params.delete('status');
    router.push(`/compras/ordenes?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Órdenes de compra</h1>
        <p className="text-sm text-muted-foreground">{filtered.length} orden{filtered.length === 1 ? '' : 'es'}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              statusFilter === f.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No hay órdenes en este filtro" description="Prueba con otro estado, o genera una orden desde Pedidos por Proveedor." />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {filtered.map((o: any) => {
            const meta = getPurchaseOrderStatusMeta(o.status);
            return (
              <a
                key={o.id}
                href={`/compras/ordenes/${o.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0 bg-card hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{o.code}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {o.supplier?.trade_name} · <DateTimeDisplay value={o.created_at} mode="date" />
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <CurrencyDisplay value={o.total} className="text-sm font-medium" />
                  <StatusBadge label={meta.label} color={meta.color} icon={meta.icon} />
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
