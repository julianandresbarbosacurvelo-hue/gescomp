'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getProductAnalysis } from '@/lib/actions/analytics';
import { getProductPriceHistory, updateProduct, deactivateProduct, getProduct } from '@/lib/actions/products';
import { listCategories } from '@/lib/actions/categories';
import { listUnits } from '@/lib/actions/units';
import { listSuppliersForProduct, setPreferredSupplier } from '@/lib/actions/suppliers';
import { listSuppliers } from '@/lib/actions/suppliers';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { useToast } from '@/lib/toast-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CurrencyDisplay, DateTimeDisplay } from '@/components/business/DisplayFormatters';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeEstablishmentId } = useEstablishmentStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [brand, setBrand] = useState('');
  const [internalCode, setInternalCode] = useState('');

  const product = useQuery({ queryKey: ['product', id], queryFn: () => getProduct(id) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => listCategories(), enabled: editing });
  const units = useQuery({ queryKey: ['units'], queryFn: () => listUnits(), enabled: editing });

  useEffect(() => {
    if (product.data) {
      setName(product.data.name ?? '');
      setCategoryId(product.data.category_id ?? '');
      setUnitId(product.data.unit_id ?? '');
      setBrand(product.data.preferred_brand ?? '');
      setInternalCode(product.data.internal_code ?? '');
    }
  }, [product.data]);

  const updateMutation = useMutation({
    mutationFn: () => updateProduct(id, { name, category_id: categoryId, unit_id: unitId, preferred_brand: brand || undefined, internal_code: internalCode || undefined }),
    onSuccess: () => {
      toast('Producto actualizado');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos actualizar el producto.', 'error'),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateProduct(id),
    onSuccess: () => { toast('Producto desactivado'); queryClient.invalidateQueries({ queryKey: ['product', id] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const analysis = useQuery({
    queryKey: ['product-analysis', id, activeEstablishmentId],
    queryFn: () => getProductAnalysis(id, activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });
  const history = useQuery({
    queryKey: ['product-price-history', id, activeEstablishmentId],
    queryFn: () => getProductPriceHistory(id, activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });
  const productSuppliers = useQuery({
    queryKey: ['product-suppliers', id, activeEstablishmentId],
    queryFn: () => listSuppliersForProduct(id, activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });
  const allSuppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => listSuppliers() });

  const setPreferredMutation = useMutation({
    mutationFn: (supplierId: string) => setPreferredSupplier(id, supplierId, activeEstablishmentId!),
    onSuccess: () => {
      toast('Proveedor habitual actualizado');
      queryClient.invalidateQueries({ queryKey: ['product-suppliers', id] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  if (analysis.isLoading || !analysis.data) {
    return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /></div>;
  }

  const a = analysis.data as any;
  const priceSeries = (a.series?.precio_vs_tiempo ?? []).map((p: any) => ({ fecha: p.fecha, precio: Number(p.precio) }));
  const spendSeries = (a.series?.gasto_mensual ?? []).map((g: any) => ({ mes: new Date(g.mes).toLocaleDateString('es-CO', { month: 'short' }), valor: Number(g.valor) }));
  const preferredSupplier = productSuppliers.data?.find((ps: any) => ps.is_preferred);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{product.data?.name ?? 'Ficha del producto'}</h1>
          <p className="text-sm text-muted-foreground">
            {a.proveedor_principal ? `Proveedor principal: ${a.proveedor_principal.proveedor}` : 'Sin historial de compras todavía'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {product.data && (
            <Badge variant={product.data.is_active ? 'secondary' : 'outline'}>
              {product.data.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Cancelar' : 'Editar producto'}
          </Button>
        </div>
      </div>

      {editing && (
        <Card>
          <CardHeader><CardTitle>Editar datos del producto</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Nombre</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Categoría</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm">
                  {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Unidad de compra</label>
                <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm">
                  {units.data?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Código interno</label>
                <Input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Marca preferida</label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <Button disabled={!name.trim() || !categoryId || !unitId || updateMutation.isPending} onClick={() => updateMutation.mutate()}>
                {updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
              </Button>
              {product.data?.is_active && (
                <button
                  onClick={() => { if (confirm('¿Desactivar este producto? Dejará de aparecer en requerimientos/órdenes nuevas.')) deactivateMutation.mutate(); }}
                  className="text-sm text-destructive hover:underline"
                >
                  Desactivar producto
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI (sección 47 del brief) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiMini label="Último precio" value={<CurrencyDisplay value={a.resumen.precio_actual} />} />
        <KpiMini label="Promedio histórico" value={<CurrencyDisplay value={a.resumen.precio_promedio} />} />
        <KpiMini label="Mínimo / Máximo" value={<span className="text-sm"><CurrencyDisplay value={a.resumen.precio_minimo} /> – <CurrencyDisplay value={a.resumen.precio_maximo} /></span>} />
        <KpiMini label="Cantidad comprada (12m)" value={<span>{a.resumen.cantidad_12_meses}</span>} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Evolución de precio</CardTitle></CardHeader>
          <CardContent>
            {priceSeries.length < 2 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Aún no hay suficiente historial para graficar.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={priceSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })} />
                  <YAxis tick={{ fontSize: 11 }} width={60} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString('es-CO')}`, 'Precio']} labelFormatter={(v) => new Date(v).toLocaleDateString('es-CO')} />
                  <Line type="monotone" dataKey="precio" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Gasto mensual</CardTitle></CardHeader>
          <CardContent>
            {spendSeries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sin compras registradas todavía.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={spendSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={60} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString('es-CO')}`, 'Gasto']} />
                  <Bar dataKey="valor" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Proveedor habitual</CardTitle></CardHeader>
        <CardContent>
          <select
            value={preferredSupplier?.supplier_id ?? ''}
            onChange={(e) => e.target.value && setPreferredMutation.mutate(e.target.value)}
            className="w-full max-w-sm h-10 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">Sin proveedor habitual asignado</option>
            {allSuppliers.data?.map((s: any) => (
              <option key={s.id} value={s.id}>{s.trade_name ?? s.legal_name}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">Define qué proveedor recibe este producto en "Pedidos por Proveedor".</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historial de precios</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {history.isLoading ? (
            <Skeleton className="h-32" />
          ) : !history.data || history.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin registros todavía.</p>
          ) : (
            history.data.map((row: any) => (
              <div key={row.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                <DateTimeDisplay value={row.recorded_at} mode="date" className="text-muted-foreground" />
                <span className="text-muted-foreground truncate">{row.supplier?.trade_name}</span>
                <CurrencyDisplay value={row.unit_price} />
                {row.variationPct !== null && (
                  <span className={cn('text-xs font-medium', row.variationPct > 0 ? 'text-status-rojo' : 'text-status-verde')}>
                    {formatPercent(row.variationPct)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{row.purchase_order?.code ?? '—'}</span>
              </div>
            ))
          )}
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
