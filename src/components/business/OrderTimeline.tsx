import { getPurchaseOrderStatusMeta } from '@/lib/status';
import { DateTimeDisplay } from '@/components/business/DisplayFormatters';

export function OrderTimeline({
  events,
}: { events: Array<{ id: string; new_status: string; changed_at: string; notes: string | null; changed_by_user: { full_name: string } | null }> }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin eventos registrados todavía.</p>;
  }

  return (
    <ol className="relative border-l border-border ml-2 space-y-5">
      {events.map((e) => {
        const meta = getPurchaseOrderStatusMeta(e.new_status);
        const Icon = meta.icon;
        return (
          <li key={e.id} className="ml-4">
            <span className="absolute -left-[9px] mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
              <Icon className="h-2.5 w-2.5 text-primary-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">{meta.label}</p>
            <p className="text-xs text-muted-foreground">
              <DateTimeDisplay value={e.changed_at} /> {e.changed_by_user && `· ${e.changed_by_user.full_name}`}
            </p>
            {e.notes && <p className="text-xs text-muted-foreground mt-0.5">{e.notes}</p>}
          </li>
        );
      })}
    </ol>
  );
}
