'use client';

import { createContext, useContext } from 'react';
import type { SessionContext as SessionContextType } from '@/lib/session-utils';

const SessionCtx = createContext<SessionContextType | null>(null);

export function SessionProvider({ value, children }: { value: SessionContextType; children: React.ReactNode }) {
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionContextType {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider> (ver AppShell)');
  return ctx;
}
