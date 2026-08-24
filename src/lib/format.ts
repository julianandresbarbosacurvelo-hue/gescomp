// Centraliza formato de moneda/fecha — nunca formatear manualmente en componentes
// individuales (sección 88 del brief de frontend).
// TZ-P1-001: se fija America/Bogota explícitamente. Antes dependía de la zona
// horaria implícita del navegador/servidor — correcto casi siempre para usuarios
// en Colombia, pero no garantizado (ej. un SSR corriendo en otra región podría
// desplazar la fecha un día cerca de la medianoche).
const BOGOTA_TZ = 'America/Bogota';

export function formatCurrencyCOP(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: BOGOTA_TZ,
  }).format(d); // DD/MM/AAAA
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: BOGOTA_TZ,
  }).format(d).replace('a. m.', 'a. m.').replace('p. m.', 'p. m.'); // 12h, "8:35 a. m."
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return `${formatDate(value)} · ${formatTime(value)}`;
}

export function formatQuantity(value: number | null | undefined, unitCode?: string): string {
  if (value === null || value === undefined) return '—';
  const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value);
  return unitCode ? `${num} ${unitCode}` : num;
}

export function formatPercent(value: number | null | undefined, withSign = true): string {
  if (value === null || value === undefined) return '—';
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}
