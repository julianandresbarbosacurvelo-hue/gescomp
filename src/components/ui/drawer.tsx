'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// NOTA DE ACCESIBILIDAD (honesta, no la escondo): esto NO tiene focus trap real todavía.
// Cierra con Escape y con clic afuera, y mueve el foco al abrir, pero no impide que Tab
// se escape del drawer hacia el contenido de atrás. Para eso lo correcto es Radix Dialog
// (maneja focus trap + aria + scroll lock de forma robusta) — no lo agregué todavía
// porque es la primera vez que este patrón aparece en la app (regla de la sección 6: no
// sumar dependencias sin justificar). Si en las próximas 2-3 pantallas volvemos a
// necesitar modal/drawer (muy probable: facturas, conciliación, ficha de proveedor),
// ahí sí vale la pena traer @radix-ui/react-dialog y migrar este componente.
export function Drawer({
  open, onClose, title, children, side = 'right',
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; side?: 'right' | 'bottom' }) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Enfocar el panel solo quiere pasar UNA VEZ, al abrir — nunca en cada
  // render. Antes dependía también de `onClose`, y como esa función se
  // recrea en cada render del padre (ej. cada tecla escrita en un campo
  // dentro del drawer), el efecto se re-ejecutaba y le robaba el foco al
  // campo que se estaba escribiendo. Separado en dos efectos para que
  // solo dependa de `open`.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'absolute bg-card shadow-card flex flex-col focus-visible:outline-none',
          side === 'right'
            ? 'right-0 top-0 h-full w-full max-w-md'
            : 'bottom-0 inset-x-0 max-h-[85vh] rounded-t-xl'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-accent" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
