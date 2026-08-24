'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronDown, LogOut, MapPin, User } from 'lucide-react';
import type { SessionContext } from '@/lib/session';
import { listAlerts } from '@/lib/actions/alerts';
import { signOut } from '@/lib/actions/auth';
import { cn } from '@/lib/utils';

export function Header({
  session, activeEstablishmentId, onSwitch,
}: { session: SessionContext; activeEstablishmentId: string; onSwitch: (id: string) => void }) {
  const uniqueEstablishments = Array.from(
    new Map(session.roles.map((r) => [r.establishmentId, r.establishmentName])).entries()
  );

  // Solo tiene sentido consultar alertas si el rol activo puede verlas (RLS las
  // restringe a admin/coordinador_compras) — evitamos una llamada que sabemos vacía.
  const canSeeAlerts = session.roles.some(
    (r) => r.establishmentId === activeEstablishmentId && ['admin', 'coordinador_compras'].includes(r.roleCode)
  );

  const { data: alerts } = useQuery({
    queryKey: ['alerts-count', activeEstablishmentId],
    queryFn: () => listAlerts(activeEstablishmentId, true),
    enabled: canSeeAlerts && !!activeEstablishmentId,
    refetchInterval: 60_000, // notificaciones "en vivo" simples por polling, sin agregar una librería de realtime todavía
  });

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-2 text-sm">
        {uniqueEstablishments.length > 1 ? (
          <label className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
            <select
              value={activeEstablishmentId}
              onChange={(e) => onSwitch(e.target.value)}
              className="bg-transparent text-sm font-medium focus-visible:outline-none"
              aria-label="Establecimiento activo"
            >
              {uniqueEstablishments.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="flex items-center gap-2 font-medium text-foreground">
            <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
            {uniqueEstablishments[0]?.[1]}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {canSeeAlerts && (
          <a href="/alertas" className="relative rounded-md p-2 hover:bg-accent" aria-label="Alertas">
            <Bell className="h-5 w-5 text-muted-foreground" aria-hidden />
            {alerts && alerts.length > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-status-rojo" aria-hidden />
            )}
          </a>
        )}
        <ProfileMenu session={session} />
      </div>
    </header>
  );
}

function ProfileMenu({ session }: { session: SessionContext }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="h-4 w-4" aria-hidden />
        </span>
        <span className="hidden md:inline text-sm font-medium">{session.fullName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 mt-2 w-48 rounded-md border border-border bg-card shadow-card py-1 z-50'
          )}
        >
          <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">{session.email}</div>
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
            >
              <LogOut className="h-4 w-4" aria-hidden /> Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
