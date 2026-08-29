'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { getBottomNavItems } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { MobileMenuDrawer } from './MobileMenuDrawer';

// El BottomNav trae solo 4 accesos rapidos por rol (diseno original, seccion 9
// del brief). Eso dejaba sin forma de llegar en celular a los demas modulos
// que si aparecen en el Sidebar de escritorio (Productos, Proveedores,
// Ordenes, Facturas, Administracion...). Se agrega un 5to boton "Mas" que abre
// un drawer con el menu completo (MobileMenuDrawer), respetando los mismos
// roles que ya filtran el Sidebar — no es una lista nueva, es la misma fuente
// de verdad (SIDEBAR_GROUPS).
export function BottomNav({ roleCodes }: { roleCodes: string[] }) {
  const pathname = usePathname();
  const items = getBottomNavItems(roleCodes);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
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
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium text-muted-foreground"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
        >
          <Menu className="h-5 w-5" aria-hidden />
          Más
        </button>
      </nav>
      <MobileMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} roleCodes={roleCodes} />
    </>
  );
}
