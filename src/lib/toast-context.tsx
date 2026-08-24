'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Toast = { id: string; message: string; variant: 'success' | 'error' };
type ToastContextValue = { toast: (message: string, variant?: Toast['variant']) => void };

const ToastCtx = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, variant: Toast['variant'] = 'success') => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-20 md:bottom-6 right-4 z-[60] flex flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-card bg-card animate-in fade-in slide-in-from-bottom-2',
              t.variant === 'success' ? 'border-status-verde/30' : 'border-status-rojo/30'
            )}
          >
            {t.variant === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-status-verde" />
            ) : (
              <XCircle className="h-4 w-4 text-status-rojo" />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider> (ver AppShell)');
  return ctx;
}
