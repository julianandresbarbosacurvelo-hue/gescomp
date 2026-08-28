'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle2 } from 'lucide-react';
import { listAlerts, resolveAlert } from '@/lib/actions/alerts';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { ErrorState } from '@/components/business/ErrorState';
import { StatusBadge } from '@/components/business/StatusBadge';
import { DateTimeDisplay } from '@/components/business/DisplayFormatters';
import { Button } from '@/components/ui/button';
import { getAlertSeverityMeta, ALERT_TYPE_LABEL } from '@/lib/status';

export default function AlertasPage() {
  const { activeEstablishmentId } = useEstablishmentStore();
  const [showResolved, setShowResolved] = useState(false);
  const queryClient = useQueryClient();

  const queryKey = ['alerts', activeEstablishmentId, showResolved];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => listAlerts(activeEstablishmentId!, !showResolved),
    enabled: !!activeEstablishmentId,
  });

  const { mutate: handleResolve, isPending: isResolving } = useMutation({
    mutationFn: (alertId: string) => resolveAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts', activeEstablishmentId] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Alertas</h1>
          <p className="text-sm text-muted-foreground">Anomalías detectadas automáticamente en el flujo de compras</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowResolved((prev) => !prev)}
        >
          {showResolved ? 'Ver solo pendientes' : 'Ver también resueltas'}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : isError ? (
        <ErrorState message="No pudimos cargar las alertas." onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={showResolved ? 'Sin alertas registradas' : 'Sin alertas pendientes'}
          description={
            showResolved
              ? 'Todavía no se ha generado ninguna alerta en este establecimiento.'
              : 'No hay anomalías pendientes por revisar en este momento.'
          }
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data.map((alert: any) => {
            const severityMeta = getAlertSeverityMeta(alert.severity);
            const typeLabel = ALERT_TYPE_LABEL[alert.type] ?? alert.type;
            return (
              <div
                key={alert.id}
                className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border last:border-0 bg-card"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge label={severityMeta.label} color={severityMeta.color} icon={severityMeta.icon} />
                    <span className="text-xs font-medium text-muted-foreground">{typeLabel}</span>
                  </div>
                  <p className="text-sm">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">
                    <DateTimeDisplay value={alert.created_at} mode="date" />
                    {alert.is_resolved && ' · Resuelta'}
                  </p>
                </div>
                {!alert.is_resolved && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={isResolving}
                    onClick={() => handleResolve(alert.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Marcar resuelta
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
