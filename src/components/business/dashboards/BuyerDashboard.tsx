'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Inbox, ShoppingCart, Truck } from 'lucide-react';
import { getDashboardSummary } from '@/lib/actions/dashboard';
import { getConsolidatedRequisitionItems } from '@/lib/actions/requisitions';
import { listAlerts } from '@/lib/actions/alerts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { ErrorState } from '@/components/business/ErrorState';
import { StatusBadge } from '@/components/business/StatusBadge';
import { getAlertSeverityMeta, ALERT_TYPE_LABEL } from '@/lib/status';
import { Badge } from '@/components/ui/badge';

export function BuyerDashboard({ establishmentId }: { establishmentId: string }) {
  const summary = useQuery({
    queryKey: ['dashboard-summary', establishmentId],
    queryFn: () => getDashboardSummary(establishmentId),
  });
  const consolidated = useQuery({
    queryKey: ['consolidated-items', establishmentId],
    queryFn: () => getConsolidatedRequisitionItems(establishmentId),
  });
  const alerts = useQuery({
    queryKey: ['alerts', establishmentId],
    queryFn: () => listAlerts(establishmentId, true),
  });

  const urgentItems = consolidated.data?.filter((i) => i.has_urgent) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">¿Qué debo gestionar ahora?</h1>
        <p className="text-sm text-muted-foreground">Prioridades del día</p>
      </div>

      {/* Requerimientos pendientes/urgentes */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2"><Inbox className="h-4 w-4" /> Requerimientos por consolidar</CardTitle>
          {summary.data && <Badge variant="outline">{summary.data.operacion.requerimientos_pendientes} pendientes</Badge>}
        </CardHeader>
        <CardContent>
          {consolidated.isLoading ? (
            <Skeleton className="h-16" />
          ) : urgentItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ítems urgentes pendientes.</p>
          ) : (
            <div className="space-y-2">
              {urgentItems.slice(0, 5).map((item: any) => (
                <div key={`${item.product_id}-${item.unregistered_product_name}`} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <span className="text-sm">{item.product?.name ?? item.unregistered_product_name}</span>
                  <StatusBadge label="Urgente" color="rojo" />
                </div>
              ))}
            </div>
          )}
          <a href="/compras/bandeja" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            Ver bandeja completa →
          </a>
        </CardContent>
      </Card>

      {/* Entregas atrasadas */}
      {summary.data && summary.data.operacion.entregas_atrasadas > 0 && (
        <Card className="border-status-rojo/30">
          <CardHeader><CardTitle className="flex items-center gap-2 text-status-rojo"><Truck className="h-4 w-4" /> Entregas atrasadas</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">{summary.data.operacion.entregas_atrasadas} orden(es) superaron su fecha esperada de entrega.</p>
            <a href="/compras/ordenes?status=atrasada" className="mt-2 inline-block text-sm font-medium text-primary hover:underline">Ver órdenes →</a>
          </CardContent>
        </Card>
      )}

      {/* Alertas / anomalías */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Alertas activas</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.isError ? (
            <ErrorState onRetry={() => alerts.refetch()} />
          ) : alerts.isLoading ? (
            <Skeleton className="h-16" />
          ) : !alerts.data || alerts.data.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Sin alertas pendientes" description="Todo está bajo control por ahora." />
          ) : (
            <div className="space-y-2">
              {alerts.data.slice(0, 6).map((a) => {
                const meta = getAlertSeverityMeta(a.severity);
                return (
                  <div key={a.id} className="flex items-start justify-between gap-3 py-1.5 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{ALERT_TYPE_LABEL[a.type] ?? a.type}</p>
                      <p className="text-xs text-muted-foreground">{a.message}</p>
                    </div>
                    <StatusBadge label={meta.label} color={meta.color} icon={meta.icon} />
                  </div>
                );
              })}
            </div>
          )}
          <a href="/alertas" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">Ver todas →</a>
        </CardContent>
      </Card>
    </div>
  );
}
