import type { LucideIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';

export function EmptyState({
  icon: Icon, title, description, actionLabel, onAction, actionHref,
}: {
  icon: LucideIcon; title: string; description: string;
  actionLabel?: string; onAction?: () => void; actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
        <Icon className="h-6 w-6 text-primary" aria-hidden />
      </div>
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-xs">{description}</p>
      {actionLabel && actionHref && (
        <a href={actionHref} className={buttonVariants({ className: 'mt-4' })}>{actionLabel}</a>
      )}
      {actionLabel && onAction && !actionHref && (
        <Button className="mt-4" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
