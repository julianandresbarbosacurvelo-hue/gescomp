'use client';

import { useQuery } from '@tanstack/react-query';
import { DollarSign, FileText, Truck, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { getDashboardSummary } from '@/lib/actions/dashboard';
import { KpiCard } from '@/components/business/KpiCard';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/business/ErrorState';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrencyCOP, formatPercent } from '@/lib/format';
import { DeviationBadge } from '@/components/business/DeviationBadge';

export function ManagerDashboard({ establishmentId }: { establishmentId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-summary', establishmentId],
    queryFn: () => getDashboardSummary(establishmentId),
  });

  if (isError) {
    return <ErrorState message="No pudimos cargar el resumen gerencial." onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }
  if (!data) return null;

  // Comparación simple mes vs. mes anterior no está en el backend todavía (solo trae el
  // acumulado del mes actual) — muestro el acumulado sin variación en vez de inventar un dato.
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Resumen gerencial</h1>
        <p className="text-sm text-muted-foreground">Estado general del abastecimiento</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Compras del mes" value={formatCurrencyCOP(data.compras.mes)} icon={DollarSign} />
        <KpiCard
          label="Órdenes abiertas"
          value={String(data.operacion.ordenes_abiertas)}
          icon={FileText}
        />
        <KpiCard
          label="Entregas pendientes / atrasadas"
          value={`${data.operacion.entregas_pendientes} / ${data.operacion.entregas_atrasadas}`}
          icon={Truck}
        />
        <KpiCard
          label="Tiempo promedio de abastecimiento"
          value={data.tiempos.dias_promedio != null ? `${data.tiempos.dias_promedio} días` : 'Sin datos aún'}
          icon={Clock}
        />
        <KpiCard
          label="Variaciones anormales de precio"
          value={String(data.precios.cantidad_variacion_anormal)}
          icon={TrendingUp}
        />
        <KpiCard
          label="Recepciones con novedades"
          value={String(data.operacion.recepciones_con_novedad)}
          icon={AlertTriangle}
        />
      </div>

      {data.precios.variacion_anormal?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Productos con variación de precio anormal</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.precios.variacion_anormal.map((p) => (
              <div key={p.producto} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-sm">{p.producto}</span>
                <DeviationBadge percent={p.variacion_pct} referenceLabel="compra anterior" threshold={0} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.proveedores.mayor_volumen && (
        <Card>
          <CardHeader><CardTitle>Proveedor con mayor volumen</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm">
              <span className="font-medium">{data.proveedores.mayor_volumen.nombre}</span> — {formatCurrencyCOP(data.proveedores.mayor_volumen.valor)}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
