'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { getPedidosPorProveedor, createPurchaseOrder } from '@/lib/actions/purchase-orders';
import { cancelRequisitionItemsBatch } from '@/lib/actions/requisitions';
import { getSupplierDetail } from '@/lib/actions/suppliers';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { useSession } from '@/lib/session-context';
import { getActiveRoleCodes } from '@/lib/session-utils';
import { useToast } from '@/lib/toast-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QuantityInput } from '@/components/business/QuantityInput';
import { DeviationBadge } from '@/components/business/DeviationBadge';
import { formatCurrencyCOP } from '@/lib/format';

export default function NuevaOrdenPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supplierId = searchParams.get('supplier');
  const { activeEstablishmentId } = useEstablishmentStore();
  const session = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Anular un producto o todo el pedido ANTES de generar la orden — a pedido del usuario:
  // la gestión real ante el proveedor ocurre acá (Pedidos por Proveedor → Nueva orden), no
  // en el Detalle de Requerimiento de cada área. Mismo rol que ya exige esa pantalla
  // (admin/coordinador_compras) y mismo criterio de "motivo obligatorio".
  const roles = getActiveRoleCodes(session.roles, activeEstablishmentId ?? '');
  const canManage = roles.includes('admin') || roles.includes('coordinador_compras');

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [prices, setPrices] = useState<Record<string, number | undefined>>({});
  const [expectedDate, setExpectedDate] = useState('');
  const [deliveryPlace, setDeliveryPlace] = useState('');
  const [notes, setNotes] = useState('');

  // Mismo mecanismo de borrador que "Nuevo requerimiento" (ver draftKey en
  // requerimientos/nuevo/page.tsx): las cantidades/precios que el coordinador de compras
  // ajusta antes de emitir la orden tampoco deben perderse ante una caída de señal o un
  // cierre accidental de la pestaña — se restauran al volver a esta pantalla y solo se
  // limpian cuando la orden se genera con éxito.
  const draftKey = activeEstablishmentId && supplierId
    ? `gescomp:draft:orden:${session.userId}:${activeEstablishmentId}:${supplierId}`
    : null;
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (!draftKey || draftRestored) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as {
          quantities?: Record<string, number>; prices?: Record<string, number | undefined>;
          expectedDate?: string; deliveryPlace?: string; notes?: string;
        };
        if (draft.quantities) setQuantities(draft.quantities);
        if (draft.prices) setPrices(draft.prices);
        if (draft.expectedDate) setExpectedDate(draft.expectedDate);
        if (draft.deliveryPlace) setDeliveryPlace(draft.deliveryPlace);
        if (draft.notes) setNotes(draft.notes);
        if (draft.quantities || draft.prices) toast('Recuperamos los cambios sin guardar de esta orden');
      }
    } catch {
      // localStorage puede fallar (modo privado, cuota llena) — no debe romper la pantalla
    }
    setDraftRestored(true);
  }, [draftKey, draftRestored, toast]);

  useEffect(() => {
    if (!draftKey || !draftRestored) return;
    try {
      const hasContent = Object.keys(quantities).length > 0 || Object.keys(prices).length > 0 || expectedDate || deliveryPlace || notes;
      if (!hasContent) {
        window.localStorage.removeItem(draftKey);
      } else {
        window.localStorage.setItem(draftKey, JSON.stringify({ quantities, prices, expectedDate, deliveryPlace, notes }));
      }
    } catch {
      // idem — persistir el borrador es una mejora, no algo que deba bloquear el flujo
    }
  }, [draftKey, draftRestored, quantities, prices, expectedDate, deliveryPlace, notes]);

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

  // Antes el "Precio unit." arrancaba siempre en blanco y había que teclearlo a mano en
  // cada orden, aunque el producto ya tuviera compras anteriores. Se prellena con el
  // último precio confirmado (price_history, cualquier proveedor) y queda editable —
  // si el coordinador lo cambia, esa es la nueva estimación para esta orden.
  useEffect(() => {
    if (items.length === 0) return;
    setPrices((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of items as any[]) {
        const key = itemKey(item);
        if (next[key] === undefined && item.last_known_price != null) {
          next[key] = Number(item.last_known_price);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  function qtyFor(key: string, fallback: number) {
    return quantities[key] ?? fallback;
  }

  // Cuando un producto quedó consolidado en dos unidades a la vez (ej. Novillano: "Carne
  // Para Asar 150 gm" con ítems viejos en kg y nuevos en und), `v_consolidated_requisition_items`
  // trae DOS filas para el mismo product_id. Antes se usaba `item.product_id` a secas como
  // llave de estado (`quantities`/`prices`) y como `key` de la lista — las dos filas
  // compartían la misma casilla y editar una pisaba la otra en silencio. La llave compuesta
  // producto+unidad separa cada fila de verdad.
  function itemKey(item: any) {
    return `${item.product_id ?? item.unregistered_product_name}:${item.unit_id}`;
  }

  // Un producto consolidado acá casi nunca es un solo ítem de requerimiento: es la suma
  // de varios (a veces de distintas áreas) que pidieron lo mismo — breakdown_by_area ya
  // trae el requisition_item_id de cada uno (migración 0033). Anular "este producto del
  // pedido" es anular TODOS esos ítems de una vez.
  function idsForItem(item: any): string[] {
    return (item.breakdown_by_area ?? []).map((a: any) => a.requisition_item_id).filter(Boolean);
  }

  const subtotal = items.reduce((sum: number, item: any) => {
    const key = itemKey(item);
    const qty = qtyFor(key, item.total_quantity);
    const price = prices[key] ?? 0;
    return sum + qty * price;
  }, 0);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const result = await createPurchaseOrder({
        establishment_id: activeEstablishmentId!,
        supplier_id: supplierId!,
        type: 'producto',
        expected_delivery_date: expectedDate || undefined,
        delivery_place: deliveryPlace || undefined,
        notes: notes || undefined,
        items: items.map((item: any) => ({
          product_id: item.product_id,
          quantity: qtyFor(itemKey(item), item.total_quantity),
          unit_id: item.unit_id,
          agreed_unit_price: prices[itemKey(item)],
          // Trazabilidad hacia los requerimientos originales — se conserva el reparto
          // por área tal como quedó consolidado (ver Fase 10 del backend).
          sources: (item.breakdown_by_area ?? []).map((a: any) => ({
            requisition_item_id: a.requisition_item_id,
            quantity_allocated: a.quantity,
          })),
        })),
      });
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => {
      toast('Orden generada y PDF listo para compartir');
      // Algunos ítems pueden haber quedado afuera por conflicto de unidad (ver
      // createPurchaseOrder) — la orden igual se genera con el resto, pero hay que avisar
      // cuáles quedaron pendientes en vez de que desaparezcan sin explicación.
      if (result.warning) toast(result.warning, 'error');
      // El borrador solo se limpia tras confirmar que la orden quedó guardada — igual que
      // en "Nuevo requerimiento", nunca antes de tener éxito real.
      if (draftKey) {
        try { window.localStorage.removeItem(draftKey); } catch { /* no crítico */ }
      }
      router.push(`/compras/ordenes/${result.data}`);
    },
    onError: (e: Error) => toast(e.message || 'No pudimos generar la orden. Intenta nuevamente.', 'error'),
  });

  // Solo un formulario de motivo abierto a la vez: 'pedido' para anular todo lo consolidado
  // de este proveedor, o la key de un producto puntual — mismo patrón que Detalle de
  // Requerimiento (cancelingTarget + cancelReason).
  const [cancelingTarget, setCancelingTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  function closeCancelForm() {
    setCancelingTarget(null);
    setCancelReason('');
  }

  const cancelItemMutation = useMutation({
    mutationFn: async (item: any) => {
      const result = await cancelRequisitionItemsBatch(idsForItem(item), cancelReason);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast('Producto anulado de este pedido');
      closeCancelForm();
      queryClient.invalidateQueries({ queryKey: ['pedidos-proveedor', activeEstablishmentId] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos anular este producto.', 'error'),
  });

  const cancelPedidoMutation = useMutation({
    mutationFn: async () => {
      const allIds = items.flatMap((item: any) => idsForItem(item));
      const result = await cancelRequisitionItemsBatch(allIds, cancelReason);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast('Pedido anulado');
      closeCancelForm();
      queryClient.invalidateQueries({ queryKey: ['pedidos-proveedor', activeEstablishmentId] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos anular este pedido.', 'error'),
  });

  if (!supplierId) {
    return <p className="text-sm text-muted-foreground">Selecciona un proveedor desde "Pedidos por proveedor" para generar una orden.</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {supplier.data ? `Orden para ${supplier.data.trade_name ?? supplier.data.legal_name}` : <Skeleton className="h-8 w-64" />}
          </h1>
          <p className="text-sm text-muted-foreground">Revisa cantidades y precio acordado antes de emitir</p>
        </div>

        {canManage && items.length > 0 && (
          cancelingTarget === 'pedido' ? (
            <div className="w-full sm:w-80 space-y-2 rounded-md border border-border p-3">
              <label className="block text-sm font-medium">Motivo para anular todo este pedido</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
                placeholder="Obligatorio — ej. se canceló el evento/reserva, cierre temporal del establecimiento"
              />
              <div className="flex gap-2">
                <Button
                  size="sm" variant="destructive"
                  disabled={!cancelReason.trim() || cancelPedidoMutation.isPending}
                  onClick={() => cancelPedidoMutation.mutate()}
                >
                  Confirmar anulación
                </Button>
                <Button size="sm" variant="ghost" onClick={closeCancelForm}>Volver</Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline" size="sm" className="text-destructive hover:text-destructive"
              onClick={() => { setCancelingTarget('pedido'); setCancelReason(''); }}
            >
              <Ban className="h-4 w-4" /> Anular todo este pedido
            </Button>
          )
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Productos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pedidos.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay ítems consolidados pendientes para este proveedor.</p>
          ) : (
            items.map((item: any) => {
              const key = itemKey(item);
              const isCancelingThis = cancelingTarget === key;
              return (
                <div key={key} className="border-b border-border pb-3 last:border-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product?.name}</p>
                      <p className="text-xs text-muted-foreground">Consolidado: {item.total_quantity} {item.unit?.code}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <QuantityInput
                        value={qtyFor(key, item.total_quantity)}
                        onChange={(v) => setQuantities((q) => ({ ...q, [key]: v }))}
                        unitCode={item.unit?.code}
                      />
                      <div className="flex flex-col items-end gap-1">
                        <Input
                          type="number"
                          placeholder="Precio unit."
                          className="w-28"
                          value={prices[key] ?? ''}
                          onChange={(e) => setPrices((p) => ({ ...p, [key]: e.target.value ? Number(e.target.value) : undefined }))}
                        />
                        {item.last_known_price != null && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Última: {formatCurrencyCOP(Number(item.last_known_price))}</span>
                            {prices[key] != null && (
                              <DeviationBadge
                                percent={((prices[key]! - Number(item.last_known_price)) / Number(item.last_known_price)) * 100}
                                referenceLabel="último precio"
                                threshold={1}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      {canManage && (
                        <button
                          onClick={() => { setCancelingTarget(key); setCancelReason(''); }}
                          className="text-muted-foreground hover:text-destructive p-1.5 self-start"
                          aria-label={`Anular ${item.product?.name} de este pedido`}
                          title="Anular este producto de este pedido"
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isCancelingThis && (
                    <div className="mt-2 space-y-2 rounded-md border border-border p-3">
                      <label className="block text-sm font-medium">Motivo para anular "{item.product?.name}" de este pedido</label>
                      <textarea
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
                        placeholder="Obligatorio — ej. ya no se necesita, se canceló el evento/reserva"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm" variant="destructive"
                          disabled={!cancelReason.trim() || cancelItemMutation.isPending}
                          onClick={() => cancelItemMutation.mutate(item)}
                        >
                          Confirmar anulación
                        </Button>
                        <Button size="sm" variant="ghost" onClick={closeCancelForm}>Volver</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
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
            <Input value={deliveryPlace} onChange={(e) => setDeliveryPlace(e.target.value)} placeholder="Ej. andén de descargue" />
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
