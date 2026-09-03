'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { listPurchaseOrders, getPurchaseOrderDetail } from '@/lib/actions/purchase-orders';
import { createInvoice, uploadInvoiceFile } from '@/lib/actions/invoices';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { useToast } from '@/lib/toast-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrencyCOP } from '@/lib/format';

const RECEIVED_STATUSES = ['recibida_parcialmente', 'recibida_totalmente', 'con_novedad'];

export default function NuevaFacturaPage() {
  const router = useRouter();
  const { activeEstablishmentId } = useEstablishmentStore();
  const { toast } = useToast();

  const [orderId, setOrderId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [file, setFile] = useState<File | null>(null);

  const orders = useQuery({
    queryKey: ['purchase-orders', activeEstablishmentId],
    queryFn: () => listPurchaseOrders(activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });
  const eligibleOrders = useMemo(() => orders.data?.filter((o: any) => RECEIVED_STATUSES.includes(o.status)) ?? [], [orders.data]);

  const orderDetail = useQuery({
    queryKey: ['purchase-order', orderId],
    queryFn: () => getPurchaseOrderDetail(orderId),
    enabled: !!orderId,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const invoiceId = await createInvoice({
        purchase_order_id: orderId,
        establishment_id: activeEstablishmentId!,
        supplier_id: (orderDetail.data as any).supplier_id,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        items: (orderDetail.data as any).purchase_order_items.map((item: any) => {
          const qty = quantities[item.id] ?? item.quantity;
          // Si la cantidad facturada es 0 (el proveedor no cobró/no entregó este ítem),
          // el precio también debe quedar en 0 — el schema (ver invoiceSchema) exige que
          // ambos campos sean 0 juntos o mayores a 0 juntos. Sin esto, un ítem con cantidad
          // 0 pero con `agreed_unit_price` heredado de la orden rompía esa regla.
          return {
            purchase_order_item_id: item.id,
            quantity_invoiced: qty,
            unit_price_invoiced: qty === 0 ? 0 : (prices[item.id] ?? item.agreed_unit_price ?? 0),
          };
        }),
      });
      if (file) await uploadInvoiceFile(invoiceId, file);
      return invoiceId;
    },
    onSuccess: (invoiceId) => {
      toast('Factura registrada');
      router.push(`/facturas/${invoiceId}`);
    },
    onError: (e: Error) => toast(e.message || 'No pudimos registrar la factura. Intenta nuevamente.', 'error'),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl font-semibold">Registrar factura</h1>
        <p className="text-sm text-muted-foreground">Se compara automáticamente contra lo ordenado y lo recibido</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Orden relacionada</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm">
            <option value="">Selecciona una orden ya recibida</option>
            {eligibleOrders.map((o: any) => (
              <option key={o.id} value={o.id}>{o.code} · {o.supplier?.trade_name}</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Número de factura</label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Fecha</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm" />
            </div>
          </div>

          <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-3 text-sm text-muted-foreground cursor-pointer hover:bg-accent">
            <Camera className="h-4 w-4" />
            {file ? file.name : 'Adjuntar factura (foto o PDF)'}
            <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </CardContent>
      </Card>

      {orderId && (
        <Card>
          <CardHeader><CardTitle>Productos facturados</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {orderDetail.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)
            ) : (
              (orderDetail.data as any)?.purchase_order_items.map((item: any) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 min-w-[140px] text-sm truncate">{item.product?.name}</span>
                  <Input
                    type="number"
                    className="w-24"
                    placeholder={`Cant. (${item.quantity})`}
                    value={quantities[item.id] ?? ''}
                    onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: Number(e.target.value) }))}
                  />
                  <Input
                    type="number"
                    className="w-28"
                    // Si se deja vacío, se factura al precio acordado en la orden (ver
                    // submitMutation) — se muestra ese valor en el placeholder para que
                    // quede claro qué se va a registrar sin necesidad de reescribirlo.
                    placeholder={item.agreed_unit_price != null ? formatCurrencyCOP(item.agreed_unit_price) : 'Precio unit.'}
                    value={prices[item.id] ?? ''}
                    onChange={(e) => setPrices((p) => ({ ...p, [item.id]: Number(e.target.value) }))}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Button
        size="lg" className="w-full"
        disabled={!orderId || !invoiceNumber || !invoiceDate || submitMutation.isPending}
        onClick={() => submitMutation.mutate()}
      >
        {submitMutation.isPending ? 'Registrando…' : 'Registrar factura'}
      </Button>
    </div>
  );
}
