'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileDown, XCircle, Lock, AlertTriangle } from 'lucide-react';
import { getPurchaseOrderDetail, getPurchaseOrderTimeline, closePurchaseOrder, cancelPurchaseOrder } from '@/lib/actions/purchase-orders';
import { useSession } from '@/lib/session-context';
import { getActiveRoleCodes } from '@/lib/session-utils';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { useToast } from '@/lib/toast-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/business/StatusBadge';
import { OrderTimeline } from '@/components/business/OrderTimeline';
import { CurrencyDisplay, DateTimeDisplay } from '@/components/business/DisplayFormatters';
import { getPurchaseOrderStatusMeta } from '@/lib/status';
import { Button } from '@/components/ui/button';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const session = useSession();
  const { activeEstablishmentId } = useEstablishmentStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);

  const roles = getActiveRoleCodes(session.roles, activeEstablishmentId ?? '');
  const canManage = roles.includes('admin') || roles.includes('coordinador_compras');

  const order = useQuery({ queryKey: ['purchase-order', id], queryFn: () => getPurchaseOrderDetail(id) });
  const timeline = useQuery({ queryKey: ['purchase-order-timeline', id], queryFn: () => getPurchaseOrderTimeline(id) });

  const closeMutation = useMutation({
    mutationFn: () => closePurchaseOrder(id),
    onSuccess: () => { toast('Orden cerrada'); queryClient.invalidateQueries({ queryKey: ['purchase-order', id] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelPurchaseOrder(id, cancelReason),
    onSuccess: () => { toast('Orden cancelada'); setShowCancelForm(false); queryClient.invalidateQueries({ queryKey: ['purchase-order', id] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  if (order.isLoading || !order.data) {
    return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /></div>;
  }

  const o = order.data as any;
  const meta = getPurchaseOrderStatusMeta(o.status);
  const canClose = o.status === 'conciliada';
  const canCancel = !['recibida_totalmente', 'conciliada', 'cerrada', 'cancelada'].includes(o.status);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{o.code}</h1>
            <StatusBadge label={meta.label} color={meta.color} icon={meta.icon} />
          </div>
          <p className="text-sm text-muted-foreground">{o.supplier?.trade_name ?? o.supplier?.legal_name}</p>
        </div>

        {/* Documento formal — solo admin/coordinador (sección 38 del brief) */}
        {o.pdf_attachment?.file_url && (
          <a
            href={o.pdf_attachment.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <FileDown className="h-4 w-4" /> Ver orden formal (PDF)
          </a>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Productos</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {o.purchase_order_items.map((item: any) => {
                // Un ítem puede tener varias entregas parciales acumuladas; nos interesa
                // el total recibido y si CUALQUIERA de esas entregas quedó marcada como
                // no conforme, para mostrar el detalle de la novedad bajo el producto.
                const deliveries = item.delivery_items ?? [];
                const totalReceived = deliveries.reduce((sum: number, d: any) => sum + Number(d.quantity_received ?? 0), 0);
                const nonConforming = deliveries.filter((d: any) => d.is_conforming === false);
                const hasNovedad = nonConforming.length > 0;

                return (
                  <div key={item.id} className="border-b border-border py-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{item.product?.name ?? item.service_description}</p>
                        <p className="text-xs text-muted-foreground">{item.quantity} {item.unit?.code}</p>
                      </div>
                      <CurrencyDisplay value={item.line_total} className="text-sm" />
                    </div>

                    {deliveries.length > 0 && (
                      <div className={`mt-1.5 flex items-start gap-1.5 text-xs ${hasNovedad ? 'text-status-rojo' : 'text-muted-foreground'}`}>
                        {hasNovedad && <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />}
                        <div>
                          <span>
                            Recibido: {totalReceived} de {item.quantity} {item.unit?.code}
                            {hasNovedad ? ' — con novedad' : ' — conforme'}
                          </span>
                          {nonConforming.map((d: any, i: number) => d.difference_reason && (
                            <p key={i} className="mt-0.5">Motivo: {d.difference_reason}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-3 font-medium">
                <span className="text-sm">Total (impuestos incluidos)</span>
                <CurrencyDisplay value={o.total} className="text-base" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Detalles de entrega</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Entrega esperada:</span> <DateTimeDisplay value={o.expected_delivery_date} mode="date" /></p>
              {o.delivery_place && <p><span className="text-muted-foreground">Lugar:</span> {o.delivery_place}</p>}
              {o.notes && <p><span className="text-muted-foreground">Observaciones:</span> {o.notes}</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              {timeline.isLoading ? <Skeleton className="h-32" /> : <OrderTimeline events={timeline.data as any} />}
            </CardContent>
          </Card>

          {/* Acciones sensibles — visibles pero deshabilitadas si no aplica el rol (sección 36) */}
          <Card>
            <CardHeader><CardTitle>Acciones</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline" className="w-full justify-start"
                disabled={!canManage || !canClose}
                title={!canManage ? 'Requiere rol Administrador o Coordinador de Compras' : !canClose ? 'La orden debe estar conciliada primero' : undefined}
                onClick={() => closeMutation.mutate()}
              >
                <Lock className="h-4 w-4" /> Cerrar orden
              </Button>

              {!showCancelForm ? (
                <Button
                  variant="outline" className="w-full justify-start text-destructive hover:text-destructive"
                  disabled={!canManage || !canCancel}
                  title={!canManage ? 'Requiere rol Administrador o Coordinador de Compras' : !canCancel ? 'Esta orden ya no se puede cancelar' : undefined}
                  onClick={() => setShowCancelForm(true)}
                >
                  <XCircle className="h-4 w-4" /> Cancelar orden
                </Button>
              ) : (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <label className="block text-sm font-medium">Motivo de cancelación</label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
                    placeholder="Obligatorio — ej. proveedor sin disponibilidad"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" disabled={!cancelReason.trim() || cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
                      Confirmar cancelación
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowCancelForm(false)}>Volver</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
