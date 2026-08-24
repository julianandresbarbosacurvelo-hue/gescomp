'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt, PlusCircle } from 'lucide-react';
import { listInvoices } from '@/lib/actions/invoices';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { StatusBadge } from '@/components/business/StatusBadge';
import { CurrencyDisplay, DateTimeDisplay } from '@/components/business/DisplayFormatters';
import { buttonVariants } from '@/components/ui/button';

export default function FacturasPage() {
  const { activeEstablishmentId } = useEstablishmentStore();
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', activeEstablishmentId],
    queryFn: () => listInvoices(activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Facturas</h1>
          <p className="text-sm text-muted-foreground">Documentos registrados y su conciliación</p>
        </div>
        <a href="/facturas/nueva" className={buttonVariants()}><PlusCircle className="h-4 w-4" /> Registrar factura</a>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Receipt} title="Sin facturas registradas" description="Registra la primera factura desde una orden ya recibida." actionLabel="Registrar factura" actionHref="/facturas/nueva" />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data.map((inv: any) => (
            <a key={inv.id} href={`/facturas/${inv.id}`} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0 bg-card hover:bg-accent">
              <div className="min-w-0">
                <p className="text-sm font-medium">{inv.invoice_number} · {inv.purchase_order?.code}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {inv.supplier?.trade_name} · <DateTimeDisplay value={inv.invoice_date} mode="date" />
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <CurrencyDisplay value={inv.final_amount_to_pay ?? inv.total} className="text-sm font-medium" />
                <StatusBadge
                  label={inv.reconciled_at ? 'Conciliada' : 'Pendiente'}
                  color={inv.reconciled_at ? 'verde' : 'gris'}
                />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
