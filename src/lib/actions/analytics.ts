'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

// Pantalla "Ficha del producto" (Fase 1, sección 24) — resumen, proveedor principal,
// series para gráficos (precio/tiempo, cantidad/tiempo, gasto mensual) y periodicidad.
export async function getProductAnalysis(productId: string, establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_product_analysis', {
    p_product_id: productId,
    p_establishment_id: establishmentId,
  });

  if (error) throw new Error(error.message);
  return data;
}

// Pantalla "ABC de Compras" / Pareto (secciones 29-30) — clasifica productos por
// participación económica acumulada: A ≈80%, B ≈15%, C ≈5%.
export type AnalyticsFilters = {
  startDate?: string;
  endDate?: string;
  supplierId?: string;
  productId?: string;
  categoryId?: string;
  areaId?: string;
};

export async function getAbcAnalysis(establishmentId: string, filters: AnalyticsFilters = {}) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_abc_analysis', {
    p_establishment_id: establishmentId,
    p_start_date: filters.startDate ?? null,
    p_end_date: filters.endDate ?? null,
    p_supplier_id: filters.supplierId ?? null,
    p_area_id: filters.areaId ?? null,
  });

  if (error) throw new Error(error.message);
  return data as Array<{
    product_id: string;
    product_name: string;
    valor_comprado: number;
    porcentaje_acumulado: number;
    clase: 'A' | 'B' | 'C';
  }>;
}

// Serie de gasto mensual a nivel de establecimiento — para el Dashboard Analítico (Etapa 13).
export async function getMonthlySpend(establishmentId: string, filters: AnalyticsFilters = {}) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_monthly_spend', {
    p_establishment_id: establishmentId,
    p_start_date: filters.startDate ?? null,
    p_end_date: filters.endDate ?? null,
    p_supplier_id: filters.supplierId ?? null,
    p_product_id: filters.productId ?? null,
    p_category_id: filters.categoryId ?? null,
    p_area_id: filters.areaId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as Array<{ mes: string; valor: number }>;
}

// Pareto por categoría — completa las 3 dimensiones que pediste poder alternar
// (producto ya existía, proveedor sale del dashboard, faltaba categoría).
export async function getCategoryPareto(establishmentId: string, filters: AnalyticsFilters = {}) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_category_pareto', {
    p_establishment_id: establishmentId,
    p_start_date: filters.startDate ?? null,
    p_end_date: filters.endDate ?? null,
    p_supplier_id: filters.supplierId ?? null,
    p_area_id: filters.areaId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as Array<{ category_name: string; valor: number; porcentaje_acumulado: number; clase: 'A' | 'B' | 'C' }>;
}
