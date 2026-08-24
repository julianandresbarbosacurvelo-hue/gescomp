'use client';

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getPedidosPorProveedor, createPurchaseOrder } from '@/lib/actions/purchase-orders';
import { getSupplierDetail } from '@/lib/actions/suppliers';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { useToast } from '@/lib/toast-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QuantityInput } from '@/components/business/QuantityInput';

export default function NuevaOrdenPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supplierId = searchParams.get('supplier');
  const { activeEstablishmentId } = useEstablishmentStore();
  const { toast } = useToast();

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [prices, setPrices] = useState<Record<string, number | undefined>>({});
  const [expectedDate, setExpectedDate] = useState('');
  const [deliveryPlace, setDeliveryPlace] = useState('');
  const [notes, setNotes] = useState('');

  const pedidos = useQuery({
    queryKey: ['pedidos-proveedor', activeEstablishmentId],
    queryFn: () => getPedidosPorProveedor(activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });
  const supplier = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: () => getSupplierDetail(supplierId!),
    enabled: !!supplierId,
  });

  const items = useMemo(
    () => (pedidos.data ? pedidos.data.bySupplier[supplierId ?? ''] ?? [] : []),
    [pedidos.data, supplierId]
  );

  function qtyFor(key: string, fallback: number) {
    return quantities[key] ?? fallback;
  }

  const subtotal = items.reduce((sum: number, item: any) => {
    const key = item.product_id;
    const qty = qtyFor(key, item.total_quantity);
    const price = prices[key] ?? 0;
    return sum + qty * price;
  }, 0);

  const submitMutation = useMutation({
    mutationFn: () =>
      createPurchaseOrder({
        establishment_id: activeEstablishmentId!,
        supplier_id: supplierId!,
        type: 'producto',
        expected_delivery_date: expectedDate || undefined,
        delivery_place: deliveryPlace || undefined,
        notes: notes || undefined,
        items: items.map((item: any) => ({
          product_id: item.product_id,
          quantity: qtyFor(item.product_id, item.total_quantity),
          unit_id: item.unit_id,
          agreed_unit_price: prices[item.product_id],
          // Trazabilidad hacia los requerimientos originales — se conserva el reparto
          // por área tal como quedó consolidado (ver Fase 10 del backend).
          sources: (item.breakdown_by_area ?? []).map((a: any) => ({
            requisition_item_id: a.requisition_item_id,
            quantity_allocated: a.quantity,
          })),
        })),
      }),
    onSuccess: (orderId) => {
      toast('Orden generada y PDF listo para compartir');
      router.push(`/compras/ordenes/${orderId}`);
    },
    onError: (e: Error) => toast(e.message || 'No pudimos generar la orden. Intenta nuevamente.', 'error'),
  });

  if (!supplierId) {
    return <p className="text-sm text-muted-foreground">Selecciona un proveedor desde "Pedidos por proveedor" para generar una orden.</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-semibold">
          {supplier.data ? `Orden para ${supplier.data.trade_name ?? supplier.data.legal_name}` : <Skeleton className="h-8 w-64" />}
        </h1>
        <p className="text-sm text-muted-foreground">Revisa cantidades y precio acordado antes de emitir</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Productos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pedidos.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay ítems consolidados pendientes para este proveedor.</p>
          ) : (
            items.map((item: any) => (
              <div key={item.product_id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 border-b border-border pb-3 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.product?.name}</p>
                  <p className="text-xs text-muted-foreground">Consolidado: {item.total_quantity} {item.unit?.code}</p>
                </div>
                <div className="flex items-center gap-2">
                  <QuantityInput
                    value={qtyFor(item.product_id, item.total_quantity)}
                    onChange={(v) => setQuantities((q) => ({ ...q, [item.product_id]: v }))}
                    unitCode={item.unit?.code}
                  />
                  <Input
                    type="number"
                    placeholder="Precio unit."
                    className="w-28"
                    value={prices[item.product_id] ?? ''}
                    onChange={(e) => setPrices((p) => ({ ...p, [item.product_id]: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Entrega</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Fecha esperada de entrega</label>
            <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Lugar de entrega</label>
            <Input value={deliveryPlace} onChange={(e) => setDeliveryPlace(e.target.value)} placeholder="Ej. Sede Bogotá, andén de descargue" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Observaciones</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <span className="text-sm text-muted-foreground">Subtotal estimado</span>
        <span className="font-mono text-lg font-semibold tabular-nums">
          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(subtotal)}
        </span>
      </div>

      <Button size="lg" className="w-full" disabled={items.length === 0 || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
        {submitMutation.isPending ? 'Generando orden…' : 'Generar orden de compra'}
      </Button>
    </div>
  );
}
