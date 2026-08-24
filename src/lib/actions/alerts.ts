'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function listAlerts(establishmentId: string, onlyUnresolved = true) {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from('alerts')
    .select('*')
    .eq('establishment_id', establishmentId)
    .order('created_at', { ascending: false });

  if (onlyUnresolved) query = query.eq('is_resolved', false);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function resolveAlert(alertId: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('alerts').update({ is_resolved: true }).eq('id', alertId);
  if (error) throw new Error(error.message);
  revalidatePath('/alertas');
}
