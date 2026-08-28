'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { getRequisitionDetail } from '@/lib/actions/requisitions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/business/ErrorState';
import { StatusBadge } from '@/components/business/StatusBadge';
import { DateTimeDisplay } from '@/components/business/DisplayFormatters';
import { getRequisitionStatusMeta } from '@/lib/status';

export default function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['requisition', id],
    queryFn: () => getRequisitionDetail(id),
  });

  if (isError) {
    return <ErrorState message="No pudimos cargar este requerimiento." onRetry={() => refetch()} />;
  }

  if (isLoading || !data) {
    return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /></div>;
  }

  const r = data as any;
  const meta = getRequisitionStatusMeta(r.status);

  return (
    <div className="space-y-6">
      <a href="/requerimientos/mis-requerimientos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Mis requerimientos
      </a>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{r.code}</h1>
            <StatusBadge label={meta.label} color={meta.color} icon={meta.icon} />
          </div>
          <p className="text-sm text-muted-foreground">{r.area?.name}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader><CardTitle>Productos solicitados</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {r.requisition_items.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.product?.name ?? item.unregistered_product_name}</p>
                    {item.notes && <p className="text-xs text-muted-foreground truncate">{item.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {item.priority === 'urgente' && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-status-rojo">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Urgente
                      </span>
                    )}
                    <span className="text-sm tabular-nums">{item.quantity} {item.unit?.code}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader><CardTitle>Detalles</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p><span className="text-muted-foreground">Solicitado por:</span> {r.requester?.full_name ?? '—'}</p>
              <p><span className="text-muted-foreground">Fecha de creación:</span> <DateTimeDisplay value={r.created_at} mode="date" /></p>
              {r.required_date && (
                <p><span className="text-muted-foreground">Fecha requerida:</span> <DateTimeDisplay value={r.required_date} mode="date" /></p>
              )}
              {r.notes && (
                <p><span className="text-muted-foreground">Observaciones:</span> {r.notes}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
