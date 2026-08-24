'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getBottomNavItems } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function BottomNav({ roleCodes }: { roleCodes: string[] }) {
  const pathname = usePathname();
  const items = getBottomNavItems(roleCodes);

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-border bg-card"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium',
              active ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
