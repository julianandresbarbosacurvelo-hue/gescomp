'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { listPurchaseOrders } from '@/lib/actions/purchase-orders';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { ErrorState } from '@/components/business/ErrorState';
import { StatusBadge } from '@/components/business/StatusBadge';
import { DateTimeDisplay } from '@/components/business/DisplayFormatters';
import { buttonVariants } from '@/components/ui/button';

const PENDING_STATUSES = ['orden_generada', 'enviada_al_proveedor', 'confirmada', 'recibida_parcialmente'];

export default function RecepcionesEsperadasPage() {
  const { activeEstablishmentId } = useEstablishmentStore();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['purchase-orders', activeEstablishmentId],
    queryFn: () => listPurchaseOrders(activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });

  const pending = useMemo(() => {
    if (!data) return [];
    return [...data]
      .filter((o: any) => PENDING_STATUSES.includes(o.status))
      .sort((a: any, b: any) => (a.expected_delivery_date ?? '').localeCompare(b.expected_delivery_date ?? ''));
  }, [data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Recepciones esperadas</h1>
        <p className="text-sm text-muted-foreground">{pending.length} orden{pending.length === 1 ? '' : 'es'} por recibir</p>
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : pending.length === 0 ? (
        <EmptyState icon={Truck} title="No hay entregas pendientes" description="Todas las órdenes están al día." />
      ) : (
        <div className="space-y-3">
          {pending.map((o: any) => (
            <div key={o.id} className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{o.supplier?.trade_name ?? o.supplier?.legal_name}</p>
                <p className="text-xs text-muted-foreground">{o.code}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Esperado: {o.expected_delivery_date ? <DateTimeDisplay value={o.expected_delivery_date} mode="date" /> : 'Sin fecha'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <StatusBadge label={o.status === 'recibida_parcialmente' ? 'Parcial' : 'Pendiente'} color={o.status === 'recibida_parcialmente' ? 'naranja' : 'gris'} />
                <a href={`/recepcion/${o.id}`} className={buttonVariants({ size: 'sm' })}>Recibir</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
