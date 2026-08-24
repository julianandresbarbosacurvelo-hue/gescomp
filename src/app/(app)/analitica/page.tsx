'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { getMonthlySpend, getCategoryPareto, getAbcAnalysis, type AnalyticsFilters } from '@/lib/actions/analytics';
import { getDashboardSummary } from '@/lib/actions/dashboard';
import { listAlerts } from '@/lib/actions/alerts';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/business/StatusBadge';
import { AnalyticsFilterBar } from '@/components/business/AnalyticsFilterBar';
import { getAlertSeverityMeta, ALERT_TYPE_LABEL } from '@/lib/status';
import { cn } from '@/lib/utils';

type ParetoDimension = 'producto' | 'proveedor' | 'categoria';

function periodToDates(periodDays: string | null): { startDate?: string; endDate?: string } {
  if (!periodDays) return {};
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - Number(periodDays));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export default function AnaliticaPage() {
  const { activeEstablishmentId } = useEstablishmentStore();
  const searchParams = useSearchParams();
  const [dimension, setDimension] = useState<ParetoDimension>('producto');

  const filters: AnalyticsFilters = {
    ...periodToDates(searchParams.get('periodo')),
    supplierId: searchParams.get('proveedor') ?? undefined,
    productId: searchParams.get('producto') ?? undefined,
    categoryId: searchParams.get('categoria') ?? undefined,
    areaId: searchParams.get('area') ?? undefined,
  };
  const filterKey = JSON.stringify(filters);

  const monthlySpend = useQuery({
    queryKey: ['monthly-spend', activeEstablishmentId, filterKey],
    queryFn: () => getMonthlySpend(activeEstablishmentId!, filters),
    enabled: !!activeEstablishmentId,
  });
  const abc = useQuery({
    queryKey: ['abc-analysis', activeEstablishmentId, filterKey],
    queryFn: () => getAbcAnalysis(activeEstablishmentId!, filters),
    enabled: !!activeEstablishmentId && dimension === 'producto',
  });
  const categoryPareto = useQuery({
    queryKey: ['category-pareto', activeEstablishmentId, filterKey],
    queryFn: () => getCategoryPareto(activeEstablishmentId!, filters),
    enabled: !!activeEstablishmentId && dimension === 'categoria',
  });
  const summary = useQuery({
    queryKey: ['dashboard-summary', activeEstablishmentId],
    queryFn: () => getDashboardSummary(activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });
  const alerts = useQuery({
    queryKey: ['alerts', activeEstablishmentId],
    queryFn: () => listAlerts(activeEstablishmentId!, true),
    enabled: !!activeEstablishmentId,
  });

  const spendSeries = (monthlySpend.data ?? []).map((m) => ({
    mes: new Date(m.mes).toLocaleDateString('es-CO', { month: 'short' }), valor: Number(m.valor),
  }));

  const supplierPareto = [...(summary.data?.proveedores.detalle ?? [])].sort((a, b) => b.valor_comprado - a.valor_comprado);

  const paretoBars =
    dimension === 'producto'
      ? (abc.data ?? []).slice(0, 10).map((p) => ({ name: p.product_name, valor: p.valor_comprado, clase: p.clase }))
      : dimension === 'categoria'
      ? (categoryPareto.data ?? []).slice(0, 10).map((c) => ({ name: c.category_name, valor: c.valor, clase: c.clase }))
      : supplierPareto.slice(0, 10).map((s) => ({ name: s.nombre, valor: s.valor_comprado, clase: undefined }));

  const classColor: Record<string, string> = { A: 'hsl(var(--primary))', B: 'hsl(var(--secondary))', C: 'hsl(var(--muted-foreground))' };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Analítica</h1>
        <p className="text-sm text-muted-foreground">Gasto, concentración de compras y anomalías</p>
      </div>

      <AnalyticsFilterBar establishmentId={activeEstablishmentId ?? ''} />

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Gasto mensual</CardTitle></CardHeader>
          <CardContent>
            {monthlySpend.isLoading ? (
              <Skeleton className="h-56" />
            ) : spendSeries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Sin compras en el periodo/filtros seleccionados.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={spendSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={70} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString('es-CO')}`, 'Gasto']} />
                  <Line type="monotone" dataKey="valor" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Pareto de compras</CardTitle>
            <div className="flex gap-1 rounded-md border border-border p-0.5">
              {(['producto', 'proveedor', 'categoria'] as ParetoDimension[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDimension(d)}
                  className={cn('rounded px-2.5 py-1 text-xs font-medium capitalize', dimension === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}
                >
                  {d}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {dimension === 'proveedor' && (
              <p className="mb-2 text-xs text-muted-foreground">
                Esta vista todavía no respeta los filtros de periodo/categoría/área — sale directo del resumen general.
              </p>
            )}
            {paretoBars.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Sin datos suficientes todavía.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={paretoBars} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString('es-CO')}`, 'Valor']} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                    {paretoBars.map((b, i) => <Cell key={i} fill={b.clase ? classColor[b.clase] : 'hsl(var(--primary))'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Anomalías priorizadas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="mb-1 text-xs text-muted-foreground">Esta lista no se filtra por los controles de arriba todavía (ver nota de alcance).</p>
            {alerts.isLoading ? (
              <Skeleton className="h-32" />
            ) : !alerts.data || alerts.data.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sin anomalías activas.</p>
            ) : (
              [...alerts.data]
                .sort((a, b) => (b.severity === 'critica' ? 1 : 0) - (a.severity === 'critica' ? 1 : 0))
                .slice(0, 8)
                .map((a) => {
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
                })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tiempo de abastecimiento</CardTitle></CardHeader>
          <CardContent>
            {summary.isLoading ? (
              <Skeleton className="h-24" />
            ) : (
              <div className="space-y-1">
                <p className="font-display text-3xl font-semibold">
                  {summary.data?.tiempos.dias_promedio != null ? `${summary.data.tiempos.dias_promedio} días` : 'Sin datos aún'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Promedio solicitud → recepción, sobre {summary.data?.tiempos.muestras ?? 0} requerimiento(s) completados. Sigue siendo un promedio general — la distribución y evolución en el tiempo quedan pendientes.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
