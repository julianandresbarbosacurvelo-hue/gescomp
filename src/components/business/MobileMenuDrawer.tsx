'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIDEBAR_GROUPS, filterGroupsByRole } from '@/lib/nav';
import { Drawer } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

// Drawer de navegacion completa para movil. El BottomNav solo trae 4 accesos
// rapidos (por diseno, seccion 9 del brief), pero eso dejaba sin forma de
// llegar en celular al resto de modulos que si aparecen en el Sidebar de
// escritorio (Productos, Proveedores, Ordenes, Facturas, Administracion...).
// Este drawer reusa la misma fuente de verdad (SIDEBAR_GROUPS +
// filterGroupsByRole) asi que respeta los mismos roles/permisos que ya se
// ven en desktop, sin duplicar la lista de modulos en un segundo lugar.
export function MobileMenuDrawer({
  open, onClose, roleCodes,
}: { open: boolean; onClose: () => void; roleCodes: string[] }) {
  const pathname = usePathname();
  const groups = filterGroupsByRole(SIDEBAR_GROUPS, roleCodes);

  return (
    <Drawer open={open} onClose={onClose} title="Menú" side="right">
      <nav className="py-2">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-4 mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground border-r-2 border-primary'
                      : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </Drawer>
  );
}
