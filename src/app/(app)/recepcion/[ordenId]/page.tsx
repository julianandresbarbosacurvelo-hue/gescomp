'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getExpectedForOrder, createDelivery, uploadDeliveryPhoto, getDeliveryItemIds } from '@/lib/actions/deliveries';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { useToast } from '@/lib/toast-context';
import { ReceivingItem } from '@/components/business/ReceivingItem';
import { ErrorState } from '@/components/business/ErrorState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReceivingItemState } from '@/components/business/receiving-types';

export default function RecepcionDetallePage() {
  const { ordenId } = useParams<{ ordenId: string }>();
  const router = useRouter();
  const { activeEstablishmentId } = useEstablishmentStore();
  const { toast } = useToast();
  const [items, setItems] = useState<ReceivingItemState[]>([]);
  const [notes, setNotes] = useState('');

  const expected = useQuery({ queryKey: ['expected-order', ordenId], queryFn: () => getExpectedForOrder(ordenId) });

  useEffect(() => {
    if (expected.data && items.length === 0) {
      setItems(
        expected.data.map((e: any) => ({
          purchase_order_item_id: e.purchase_order_item_id,
          product_id: e.product_id,
          name: e.name,
          unit_code: e.unit_code,
          ordered: e.ordered,
          pending: e.pending,
          quantity_received: e.pending, // por defecto viene "todo llegó completo" — confirmar es el caso normal (sección 30)
          hasNovedad: false,
          showPriceInput: false,
          agreed_unit_price: e.agreed_unit_price,
        }))
      );
    }
  }, [expected.data, items.length]);

  function updateItem(index: number, patch: Partial<ReceivingItemState>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const deliveryId = await createDelivery({
        purchase_order_id: ordenId,
        establishment_id: activeEstablishmentId!,
        notes: notes || undefined,
        items: items.map((it) => ({
          purchase_order_item_id: it.purchase_order_item_id,
          quantity_received: it.quantity_received,
          difference_reason: it.hasNovedad ? it.difference_reason : undefined,
          invoiced_unit_price: it.invoiced_unit_price,
        })),
      });

      // Confirmación de persistencia real ANTES de dar por cerrado (sección 63: nunca UI
      // optimista en recepción/precios). Las fotos se suben DESPUÉS porque recién ahora
      // existen los delivery_item.id reales — ver nota en uploadDeliveryPhoto.
      const itemsWithPhoto = items.filter((it) => it.photoFile);
      if (itemsWithPhoto.length > 0) {
        const deliveryItemIds = await getDeliveryItemIds(deliveryId);
        for (const it of itemsWithPhoto) {
          const match = deliveryItemIds.find((d) => d.purchase_order_item_id === it.purchase_order_item_id);
          if (match) await uploadDeliveryPhoto(deliveryId, match.id, it.photoFile!);
        }
      }
      return deliveryId;
    },
    onSuccess: () => {
      toast('Recepción guardada');
      router.push('/recepcion');
    },
    onError: (e: Error) => toast(e.message || 'No pudimos guardar la recepción. Intenta nuevamente.', 'error'),
  });

  if (expected.isError) {
    return <ErrorState message="No pudimos cargar los productos de esta orden." onRetry={() => expected.refetch()} />;
  }

  if (expected.isLoading || items.length === 0) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;
  }

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h1 className="font-display text-2xl font-semibold">Recibir pedido</h1>
        <p className="text-sm text-muted-foreground">Confirma lo que realmente llegó, producto por producto</p>
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <ReceivingItem key={item.purchase_order_item_id} item={item} establishmentId={activeEstablishmentId!} onChange={(patch) => updateItem(i, patch)} />
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Observaciones generales (opcional)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
      </div>

      {/* Sticky CTA — permanece accesible (sección 66) */}
      <div className="fixed bottom-16 md:bottom-0 inset-x-0 border-t border-border bg-card p-4 z-40">
        <Button size="lg" className="w-full" disabled={submitMutation.isPending} onClick={() => submitMutation.mutate()}>
          {submitMutation.isPending ? 'Guardando…' : 'Confirmar recepción'}
        </Button>
      </div>
    </div>
  );
}
