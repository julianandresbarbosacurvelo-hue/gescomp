import { useEffect, useState } from 'react';

// Sección 82 del brief: "no lanzar requests en cada pulsación sin control". Encontré
// en la auditoría de Performance que el buscador de "Nuevo Requerimiento" y el de
// "Productos" disparaban una consulta al servidor por cada tecla — este hook lo corrige.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
