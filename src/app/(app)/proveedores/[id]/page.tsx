'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getSupplierDetail } from '@/lib/actions/suppliers';
import { getSupplierAnalysis } from '@/lib/actions/suppliers';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CurrencyDisplay } from '@/components/business/DisplayFormatters';
import { StatusBadge } from '@/components/business/StatusBadge';

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeEstablishmentId } = useEstablishmentStore();

  const supplier = useQuery({ queryKey: ['supplier', id], queryFn: () => getSupplierDetail(id) });
  const analysis = useQuery({
    queryKey: ['supplier-analysis', id, activeEstablishmentId],
    queryFn: () => getSupplierAnalysis(id, activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });

  if (supplier.isLoading || !supplier.data) {
    return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /></div>;
  }

  const s = supplier.data as any;
  const a = analysis.data as any;
  const monthlySeries = (a?.series?.compras_mensuales ?? []).map((m: any) => ({
    mes: new Date(m.mes).toLocaleDateString('es-CO', { month: 'short' }),
    valor: Number(m.valor),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{s.trade_name ?? s.legal_name}</h1>
          <p className="text-sm text-muted-foreground">{s.contact_name}{s.phone ? ` · ${s.phone}` : ''}{s.email ? ` · ${s.email}` : ''}</p>
        </div>
        <StatusBadge label={s.is_active ? 'Activo' : 'Inactivo'} color={s.is_active ? 'verde' : 'gris'} />
      </div>

      {/* KPI (sección 51 del brief) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiMini label="Valor comprado" value={<CurrencyDisplay value={a?.resumen?.valor_comprado} />} />
        <KpiMini label="Órdenes" value={String(a?.resumen?.numero_ordenes ?? 0)} />
        <KpiMini label="Tiempo promedio entrega" value={a?.resumen?.dias_promedio_entrega != null ? `${a.resumen.dias_promedio_entrega} días` : 'Sin datos'} />
        <KpiMini label="Cumplimiento" value={a?.resumen?.cumplimiento_pct != null ? `${a.resumen.cumplimiento_pct}%` : 'Sin datos'} />
        <KpiMini label="Novedades" value={String(a?.resumen?.novedades ?? 0)} />
        <KpiMini label="Entregas parciales" value={String(a?.resumen?.entregas_parciales ?? 0)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Compras mensuales</CardTitle></CardHeader>
          <CardContent>
            {monthlySeries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin compras registradas todavía.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={60} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString('es-CO')}`, 'Compras']} />
                  <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Productos principales</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {!a?.productos_principales || a.productos_principales.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin historial todavía.</p>
            ) : (
              a.productos_principales.map((p: any) => (
                <div key={p.producto} className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0">
                  <span className="truncate">{p.producto}</span>
                  <CurrencyDisplay value={p.valor} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Condiciones comerciales</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <p><span className="text-muted-foreground">NIT:</span> {s.nit ?? '—'}</p>
          <p><span className="text-muted-foreground">Condiciones de pago:</span> {s.payment_terms ?? '—'}</p>
          <p><span className="text-muted-foreground">Plazo de entrega habitual:</span> {s.delivery_lead_time_days ? `${s.delivery_lead_time_days} días` : '—'}</p>
          <p><span className="text-muted-foreground">Pedido mínimo:</span> {s.min_order_value ? <CurrencyDisplay value={s.min_order_value} /> : '—'}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiMini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 border-t-2 border-t-primary">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 font-display text-lg font-semibold">{value}</div>
    </div>
  );
}
