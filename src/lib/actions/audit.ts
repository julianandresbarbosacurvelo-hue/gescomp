'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

// Pantalla "Auditoría" (solo admin, según RLS de la Fase 7) — filtra por tabla y/o registro.
export async function listAuditLogs(filters: { tableName?: string; recordId?: string; limit?: number } = {}) {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from('audit_logs')
    .select('*, user:users(full_name)')
    .order('performed_at', { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.tableName) query = query.eq('table_name', filters.tableName);
  if (filters.recordId) query = query.eq('record_id', filters.recordId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
