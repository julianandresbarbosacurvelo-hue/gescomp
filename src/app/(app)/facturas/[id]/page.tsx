'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, FileDown } from 'lucide-react';
import { getInvoiceDetail, getThreeWayMatchSummary, reconcileInvoice } from '@/lib/actions/invoices';
import { useToast } from '@/lib/toast-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/business/StatusBadge';
import { CurrencyDisplay, DateTimeDisplay } from '@/components/business/DisplayFormatters';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [finalAmount, setFinalAmount] = useState('');
  const [priceAdjustments, setPriceAdjustments] = useState<Record<string, number>>({});

  const invoice = useQuery({ queryKey: ['invoice', id], queryFn: () => getInvoiceDetail(id) });
  const match = useQuery({
    queryKey: ['three-way-match', invoice.data?.purchase_order?.id],
    queryFn: () => getThreeWayMatchSummary(invoice.data!.purchase_order!.id),
    enabled: !!invoice.data?.purchase_order?.id,
  });

  const reconcileMutation = useMutation({
    mutationFn: () =>
      reconcileInvoice({
        invoice_id: id,
        final_amount_to_pay: Number(finalAmount),
        price_adjustments: Object.entries(priceAdjustments)
          .filter(([, price]) => price > 0)
          .map(([itemId, unit_price]) => {
            const item = (invoice.data as any).invoice_items.find((i: any) => i.id === itemId);
            return { product_id: item.purchase_order_item.product_id, unit_price, unit_id: item.purchase_order_item.unit_id };
          }),
      }),
    onSuccess: () => {
      toast('Factura conciliada');
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  if (invoice.isLoading || !invoice.data) {
    return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /></div>;
  }

  const inv = invoice.data as any;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{inv.invoice_number}</h1>
          <p className="text-sm text-muted-foreground">
            {inv.supplier?.trade_name} · {inv.purchase_order?.code} · <DateTimeDisplay value={inv.invoice_date} mode="date" />
          </p>
        </div>
        <div className="flex items-center gap-3">
          {inv.file_attachment?.file_url && (
            <a href={inv.file_attachment.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <FileDown className="h-4 w-4" /> Ver documento
            </a>
          )}
          <StatusBadge label={inv.reconciled_at ? 'Conciliada' : 'Pendiente de conciliar'} color={inv.reconciled_at ? 'verde' : 'gris'} />
        </div>
      </div>

      {/* Three-way match — sección 22/45 del brief */}
      <Card>
        <CardHeader><CardTitle>Comparación: ordenado vs. recibido vs. facturado</CardTitle></CardHeader>
        <CardContent>
          {match.isLoading ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-2">
              {match.data?.map((row, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border py-2 last:border-0 text-sm">
                  <span className="truncate flex-1">{row.name}</span>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <span>Ord: {row.ordered}</span>
                    <span>Rec: {row.received}</span>
                    <span>Fact: {row.invoiced}</span>
                    {row.matches ? (
                      <CheckCircle2 className="h-4 w-4 text-status-verde" aria-label="Coincide" />
                    ) : (
                      <XCircle className="h-4 w-4 text-status-rojo" aria-label="No coincide" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Ítems facturados</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {inv.invoice_items.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between border-b border-border py-2 last:border-0 text-sm">
              <span>{item.purchase_order_item?.product?.name}</span>
              <span className="text-muted-foreground">{item.quantity_invoiced} {item.purchase_order_item?.unit?.code}</span>
              <CurrencyDisplay value={item.line_total} />
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 font-medium">
            <span className="text-sm">Total facturado</span>
            <CurrencyDisplay value={inv.total} className="text-base" />
          </div>
        </CardContent>
      </Card>

      {/* Conciliación — el coordinador fija el valor final a pagar (Fase 12 del backend) */}
      <Card>
        <CardHeader><CardTitle>Conciliación</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {inv.reconciled_at ? (
            <p className="text-sm">
              Conciliada el <DateTimeDisplay value={inv.reconciled_at} /> — valor final a pagar:{' '}
              <CurrencyDisplay value={inv.final_amount_to_pay} className="font-medium" />
            </p>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1.5">Ajustar precio vigente por producto (opcional)</label>
                <p className="text-xs text-muted-foreground mb-2">
                  Si el precio negociado final es distinto al facturado, ajústalo aquí — quedará como el precio vigente del producto.
                </p>
                <div className="space-y-2">
                  {inv.invoice_items.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <span className="flex-1 text-sm truncate">{item.purchase_order_item?.product?.name}</span>
                      <Input
                        type="number"
                        className="w-32"
                        placeholder={`Facturado: ${item.unit_price_invoiced}`}
                        value={priceAdjustments[item.id] ?? ''}
                        onChange={(e) => setPriceAdjustments((p) => ({ ...p, [item.id]: Number(e.target.value) }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Valor final a pagar</label>
                <Input type="number" value={finalAmount} onChange={(e) => setFinalAmount(e.target.value)} placeholder={String(inv.total)} />
                <p className="mt-1 text-xs text-muted-foreground">Puede diferir del total facturado si hay descuentos o ajustes negociados.</p>
              </div>
              <Button disabled={!finalAmount || reconcileMutation.isPending} onClick={() => reconcileMutation.mutate()}>
                {reconcileMutation.isPending ? 'Conciliando…' : 'Conciliar factura'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
