'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle, Ban } from 'lucide-react';
import { getRequisitionDetail, cancelRequisitionItem, cancelRequisition } from '@/lib/actions/requisitions';
import { useSession } from '@/lib/session-context';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { getActiveRoleCodes } from '@/lib/session-utils';
import { useToast } from '@/lib/toast-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/business/ErrorState';
import { StatusBadge } from '@/components/business/StatusBadge';
import { DateTimeDisplay } from '@/components/business/DisplayFormatters';
import { getRequisitionStatusMeta } from '@/lib/status';

export default function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const session = useSession();
  const { activeEstablishmentId } = useEstablishmentStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Anular ítems/requerimientos completos es una acción sensible (afecta lo que otra
  // persona pidió) — mismo criterio de rol que ya se usa para cancelar una orden de
  // compra (Detalle de Orden): solo admin o coordinador_compras.
  const roles = getActiveRoleCodes(session.roles, activeEstablishmentId ?? '');
  const canManage = roles.includes('admin') || roles.includes('coordinador_compras');

  // Solo un formulario de motivo abierto a la vez: 'requisition' para anular todo el
  // requerimiento, o el id de un ítem puntual — igual que el patrón ya usado en
  // Detalle de Orden (showCancelForm + cancelReason), extendido a más de un target.
  const [cancelingTarget, setCancelingTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['requisition', id],
    queryFn: () => getRequisitionDetail(id),
  });

  function closeForm() {
    setCancelingTarget(null);
    setCancelReason('');
  }

  const cancelItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const result = await cancelRequisitionItem(itemId, cancelReason);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast('Ítem anulado');
      closeForm();
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos anular este ítem.', 'error'),
  });

  const cancelRequisitionMutation = useMutation({
    mutationFn: async () => {
      const result = await cancelRequisition(id, cancelReason);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast('Requerimiento anulado');
      closeForm();
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos anular este requerimiento.', 'error'),
  });

  if (isError) {
    return <ErrorState message="No pudimos cargar este requerimiento." onRetry={() => refetch()} />;
  }

  if (isLoading || !data) {
    return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /></div>;
  }

  const r = data as any;
  const meta = getRequisitionStatusMeta(r.status);
  // "Antes del cierre" (como lo pidió el usuario): solo tiene sentido anular mientras
  // el requerimiento sigue 'enviado' — una vez pasó a orden, se cerró o ya se anuló,
  // la función del backend lo rechaza igual, pero ocultar el botón evita el intento.
  const canCancelRequisition = r.status === 'enviado';

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

        {canManage && canCancelRequisition && (
          cancelingTarget === 'requisition' ? (
            <div className="w-full sm:w-80 space-y-2 rounded-md border border-border p-3">
              <label className="block text-sm font-medium">Motivo para anular todo el requerimiento</label>
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
                  disabled={!cancelReason.trim() || cancelRequisitionMutation.isPending}
                  onClick={() => cancelRequisitionMutation.mutate()}
                >
                  Confirmar anulación
                </Button>
                <Button size="sm" variant="ghost" onClick={closeForm}>Volver</Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline" size="sm" className="text-destructive hover:text-destructive"
              onClick={() => { setCancelingTarget('requisition'); setCancelReason(''); }}
            >
              <Ban className="h-4 w-4" /> Anular requerimiento
            </Button>
          )
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader><CardTitle>Productos solicitados</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {r.requisition_items.map((item: any) => {
                const isCancelled = !!item.cancelled_at;
                const isCancelingThis = cancelingTarget === item.id;
                return (
                  <div key={item.id} className="border-b border-border py-2 last:border-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className={`min-w-0 ${isCancelled ? 'opacity-50' : ''}`}>
                        <p className="text-sm font-medium">{item.product?.name ?? item.unregistered_product_name}</p>
                        {item.notes && <p className="text-xs text-muted-foreground truncate">{item.notes}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {isCancelled ? (
                          <StatusBadge label="Anulado" color="gris" icon={Ban} />
                        ) : (
                          <>
                            {item.priority === 'urgente' && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-status-rojo">
                                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Urgente
                              </span>
                            )}
                            <span className="text-sm tabular-nums">{item.quantity} {item.unit?.code}</span>
                            {canManage && canCancelRequisition && (
                              <button
                                onClick={() => { setCancelingTarget(item.id); setCancelReason(''); }}
                                className="text-muted-foreground hover:text-destructive p-1"
                                aria-label={`Anular ${item.product?.name ?? item.unregistered_product_name}`}
                                title="Anular este ítem"
                              >
                                <Ban className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {isCancelled && item.cancelled_reason && (
                      <p className="mt-1 text-xs text-muted-foreground">Motivo: {item.cancelled_reason}</p>
                    )}

                    {isCancelingThis && (
                      <div className="mt-2 space-y-2 rounded-md border border-border p-3">
                        <label className="block text-sm font-medium">Motivo para anular este ítem</label>
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
                            onClick={() => cancelItemMutation.mutate(item.id)}
                          >
                            Confirmar anulación
                          </Button>
                          <Button size="sm" variant="ghost" onClick={closeForm}>Volver</Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
