'use client';

import { useEffect, useMemo } from 'react';
import type { SessionContext } from '@/lib/session';
import { getActiveRoleCodes } from '@/lib/session-utils';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { SessionProvider } from '@/lib/session-context';
import { ToastProvider } from '@/lib/toast-context';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Header } from './Header';

export function AppShell({ session, children }: { session: SessionContext; children: React.ReactNode }) {
  const { activeEstablishmentId, setActiveEstablishment } = useEstablishmentStore();

  // Si no hay establecimiento activo guardado (primera visita) o el guardado ya no
  // pertenece a los roles del usuario, se cae al primero disponible.
  useEffect(() => {
    const stillValid = session.roles.some((r) => r.establishmentId === activeEstablishmentId);
    if (!stillValid && session.roles.length > 0) {
      setActiveEstablishment(session.roles[0].establishmentId);
    }
  }, [activeEstablishmentId, session.roles, setActiveEstablishment]);

  const effectiveEstablishmentId = activeEstablishmentId ?? session.roles[0]?.establishmentId ?? '';

  // Roles del usuario SOLO en el establecimiento activo — es lo que decide qué ve
  // en sidebar/bottom nav (un coordinador en Bogotá no debería ver "Administración"
  // si en Medellín no tiene rol admin, por ejemplo).
  const activeRoleCodes = useMemo(
    () => getActiveRoleCodes(session.roles, effectiveEstablishmentId),
    [session.roles, effectiveEstablishmentId]
  );

  return (
    <div className="min-h-screen bg-background">
      <SessionProvider value={session}>
        <ToastProvider>
          <div className="flex">
            <Sidebar roleCodes={activeRoleCodes} />
            <div className="flex-1 flex flex-col min-w-0">
              <Header session={session} activeEstablishmentId={effectiveEstablishmentId} onSwitch={setActiveEstablishment} />
              <main className="flex-1 pb-20 md:pb-6 px-4 md:px-6 py-6 container">{children}</main>
            </div>
          </div>
          <BottomNav roleCodes={activeRoleCodes} />
        </ToastProvider>
      </SessionProvider>
    </div>
  );
}
