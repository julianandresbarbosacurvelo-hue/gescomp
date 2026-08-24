'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { SIDEBAR_GROUPS, filterGroupsByRole } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function Sidebar({ roleCodes }: { roleCodes: string[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const groups = filterGroupsByRole(SIDEBAR_GROUPS, roleCodes);

  return (
    <aside
      className={cn(
        'hidden md:flex md:flex-col border-r border-border bg-card shrink-0 transition-all',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-border">
        {!collapsed && <span className="font-display text-lg font-semibold text-foreground">Gescomp</span>}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <div className="px-4 mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground border-r-2 border-primary'
                      : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
