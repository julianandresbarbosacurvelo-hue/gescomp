import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/business/StatusBadge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function SupplierCard({
  name, itemCount, areaCount, urgentCount, manageHref,
}: { name: string; itemCount: number; areaCount: number; urgentCount: number; manageHref: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <h3 className="font-display text-base font-semibold">{name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {itemCount} producto{itemCount === 1 ? '' : 's'} · {areaCount} área{areaCount === 1 ? '' : 's'} solicitante{areaCount === 1 ? '' : 's'}
        </p>
        {urgentCount > 0 && (
          <div className="mt-2">
            <StatusBadge label={`${urgentCount} producto${urgentCount === 1 ? '' : 's'} urgente${urgentCount === 1 ? '' : 's'}`} color="rojo" />
          </div>
        )}
        <a href={manageHref} className={cn(buttonVariants({ variant: 'default' }), 'mt-4 w-full')}>
          Gestionar pedido
        </a>
      </CardContent>
    </Card>
  );
}
