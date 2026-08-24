import { formatCurrencyCOP, formatDate, formatTime, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function CurrencyDisplay({ value, className }: { value: number | null | undefined; className?: string }) {
  return <span className={cn('font-mono tabular-nums', className)}>{formatCurrencyCOP(value)}</span>;
}

export function DateTimeDisplay({
  value, mode = 'datetime', className,
}: { value: string | Date | null | undefined; mode?: 'date' | 'time' | 'datetime'; className?: string }) {
  const text = mode === 'date' ? formatDate(value) : mode === 'time' ? formatTime(value) : formatDateTime(value);
  return <span className={cn('tabular-nums', className)}>{text}</span>;
}
