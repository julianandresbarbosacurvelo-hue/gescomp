'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// Antes esto era un <div> de solo lectura entre dos botones +/- — para pasar de,
// digamos, 1 a 50 kg había que hacer clic 98 veces. Un coordinador de compras pidió
// poder escribir el número directamente, no solo con las flechas de sumar/restar.
//
// Se usa un estado de texto local (`text`) separado del `value` numérico que maneja
// el padre, para poder mostrar estados intermedios mientras se escribe (vacío, "12.",
// solo "-") sin que cada tecla dispare un `onChange` con un número a medio escribir.
// El valor solo se confirma — y se clampa al mínimo — al perder el foco o al
// presionar Enter. También acepta "," como separador decimal, que es lo más natural
// de teclear acá. Si lo que quedó escrito no es un número válido, se revierte al
// último valor bueno en vez de dejar la cantidad en blanco o en NaN.
export function QuantityInput({
  value, onChange, unitCode, min = 0.5, step = 0.5, className,
}: { value: number; onChange: (v: number) => void; unitCode?: string; min?: number; step?: number; className?: string }) {
  const [text, setText] = useState(String(value));

  // Si `value` cambia desde afuera (carga inicial, o los botones +/- del propio
  // componente), el texto visible se resincroniza. No se sincroniza en cada
  // render porque eso pisaría lo que el usuario está escribiendo a mitad de tecleo.
  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit() {
    const normalized = text.trim().replace(',', '.');
    const parsed = Number(normalized);
    if (normalized === '' || Number.isNaN(parsed)) {
      setText(String(value)); // no era un número válido — se revierte al último valor bueno
      return;
    }
    const clamped = Math.max(min, Number(parsed.toFixed(2)));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input hover:bg-accent"
        aria-label="Disminuir cantidad"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="flex h-8 min-w-[4.5rem] items-center rounded-md border border-input px-2 focus-within:ring-2 focus-within:ring-ring">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="w-full min-w-0 bg-transparent text-center text-sm font-medium tabular-nums outline-none"
          aria-label="Cantidad"
        />
        {unitCode && <span className="ml-1 shrink-0 text-xs text-muted-foreground">{unitCode}</span>}
      </div>
      <button
        type="button"
        onClick={() => onChange(Number((value + step).toFixed(2)))}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input hover:bg-accent"
        aria-label="Aumentar cantidad"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
