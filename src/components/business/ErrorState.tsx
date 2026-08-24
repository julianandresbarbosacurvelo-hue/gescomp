import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Sección 61 del brief: los errores deben explicar qué pasó y qué puede hacer el usuario —
// nunca "no hay datos" cuando en realidad la consulta falló. Este componente existe porque
// encontré, en la auditoría de UX QA, que casi todas las pantallas usaban `!data` tanto para
// "vacío" como para "error", mostrando el empty state incorrecto cuando algo realmente falla.
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <AlertCircle className="h-8 w-8 text-status-rojo mb-2" aria-hidden />
      <p className="text-sm font-medium">No pudimos cargar esta información.</p>
      <p className="text-xs text-muted-foreground mt-1">{message ?? 'Intenta nuevamente en unos segundos.'}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
