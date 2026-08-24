'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export type DashboardSummary = {
  compras: { hoy: number; semana: number; mes: number; anio: number };
  operacion: {
    requerimientos_pendientes: number;
    ordenes_abiertas: number;
    entregas_pendientes: number;
    entregas_atrasadas: number;
    recepciones_con_novedad: number;
  };
  proveedores: {
    mayor_volumen: { nombre: string; valor: number } | null;
    detalle: Array<{
      nombre: string;
      valor_comprado: number;
      novedades: number;
      entregas_parciales: number;
      dias_promedio_entrega: number | null;
      cumplimiento_pct: number;
    }>;
  };
  precios: {
    mayor_aumento: Array<{ producto: string; variacion_pct: number }>;
    mayor_disminucion: Array<{ producto: string; variacion_pct: number }>;
    variacion_anormal: Array<{ producto: string; variacion_pct: number }>;
    cantidad_variacion_anormal: number;
  };
  tiempos: { horas_promedio: number | null; dias_promedio: number | null; muestras: number };
};

// Una sola llamada RPC trae las 4 secciones del Dashboard Principal
// (Compras / Operación / Proveedores / Precios) — ver Fase 1, sección 23.
export async function getDashboardSummary(establishmentId: string): Promise<DashboardSummary> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_dashboard_summary', {
    p_establishment_id: establishmentId,
  });

  if (error) throw new Error(error.message);
  return data as DashboardSummary;
}
