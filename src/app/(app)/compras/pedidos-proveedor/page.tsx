'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { getPedidosPorProveedor } from '@/lib/actions/purchase-orders';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { SupplierCard } from '@/components/business/SupplierCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ShoppingCart } from 'lucide-react';

export default function PedidosPorProveedorPage() {
  const { activeEstablishmentId } = useEstablishmentStore();
  const { data, isLoading } = useQuery({
    queryKey: ['pedidos-proveedor', activeEstablishmentId],
    queryFn: () => getPedidosPorProveedor(activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });

  const supplierEntries = data ? Object.entries(data.bySupplier) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Pedidos por proveedor</h1>
        <p className="text-sm text-muted-foreground">Qué debe pedirse a cada proveedor, según lo consolidado</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : supplierEntries.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Sin pedidos por gestionar" description="No hay productos consolidados con proveedor habitual asignado todavía." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {supplierEntries.map(([supplierId, items]: [string, any[]]) => {
            const areaCodes = new Set<string>();
            let urgentCount = 0;
            items.forEach((i) => {
              (i.breakdown_by_area ?? []).forEach((a: any) => areaCodes.add(a.area_code));
              if (i.has_urgent) urgentCount += 1;
            });
            const supplierName = items[0]?.supplier?.trade_name ?? items[0]?.supplier?.legal_name ?? 'Proveedor';
            return (
              <SupplierCard
                key={supplierId}
                name={supplierName}
                itemCount={items.length}
                areaCount={areaCodes.size}
                urgentCount={urgentCount}
                // La pantalla de destino se construye en la Etapa 8 (Órdenes) — el enlace
                // ya queda correcto, pero hoy no tiene página propia todavía.
                manageHref={`/compras/ordenes/nueva?supplier=${supplierId}`}
              />
            );
          })}
        </div>
      )}

      {data && data.withoutSupplier.length > 0 && (
        <Card className="border-status-naranja/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-status-naranja">
              <AlertTriangle className="h-4 w-4" /> Productos sin proveedor habitual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              Estos productos están consolidados pero no tienen un proveedor marcado como habitual —
              asígnalo desde la ficha del producto para que aparezcan agrupados arriba.
            </p>
            <div className="space-y-1">
              {data.withoutSupplier.map((i: any) => (
                <div key={i.product_id ?? i.unregistered_product_name} className="text-sm flex justify-between py-1 border-b border-border last:border-0">
                  <span>{i.product?.name ?? i.unregistered_product_name}</span>
                  <span className="text-muted-foreground tabular-nums">{i.total_quantity} {i.unit?.code}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
