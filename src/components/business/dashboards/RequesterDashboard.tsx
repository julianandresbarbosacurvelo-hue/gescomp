'use client';

import { useQuery } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { listMyRequisitions } from '@/lib/actions/requisitions';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { ErrorState } from '@/components/business/ErrorState';
import { StatusBadge } from '@/components/business/StatusBadge';
import { getRequisitionStatusMeta } from '@/lib/status';
import { DateTimeDisplay } from '@/components/business/DisplayFormatters';
import { ClipboardList } from 'lucide-react';

export function RequesterDashboard({ establishmentId }: { establishmentId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-requisitions', establishmentId],
    queryFn: () => listMyRequisitions(establishmentId),
  });

  const counts = data?.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Mis requerimientos</h1>
          <p className="text-sm text-muted-foreground">Lo que has solicitado para tu área</p>
        </div>
        <a href="/requerimientos/nuevo" className={buttonVariants({ size: 'lg' })}>
          <PlusCircle className="h-4 w-4" /> Nuevo requerimiento
        </a>
      </div>

      {counts && Object.keys(counts).length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {Object.entries(counts).map(([status, count]) => {
            const meta = getRequisitionStatusMeta(status);
            return (
              <div key={status} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <StatusBadge label={meta.label} color={meta.color} icon={meta.icon} />
                <span className="text-sm font-semibold">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      <Card>
        <CardContent className="pt-5">
          {isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !data || data.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No tienes requerimientos pendientes"
              description="Todo está al día."
              actionLabel="Crear requerimiento"
              actionHref="/requerimientos/nuevo"
            />
          ) : (
            <div className="divide-y divide-border">
              {data.slice(0, 8).map((r) => {
                const meta = getRequisitionStatusMeta(r.status);
                return (
                  <a key={r.id} href={`/requerimientos/${r.id}`} className="flex items-center justify-between py-3 hover:bg-accent -mx-2 px-2 rounded-md">
                    <div>
                      <p className="text-sm font-medium">{r.code}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.requisition_items?.length ?? 0} producto(s) · <DateTimeDisplay value={r.created_at} mode="date" />
                      </p>
                    </div>
                    <StatusBadge label={meta.label} color={meta.color} icon={meta.icon} />
                  </a>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
