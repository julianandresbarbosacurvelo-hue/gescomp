'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { areaSchema, type AreaInput } from '@/lib/validators/area';
import { revalidatePath } from 'next/cache';

export async function listAreas(establishmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('establishment_id', establishmentId)
    .order('name');
  if (error) throw new Error(error.message);
  return data;
}

// El área de un usuario con rol de área (cocina/bar/servicio) es, por diseño, la que
// comparte código con su rol (ver Fase 7 del backend). Se usa para no pedirle al
// usuario que "elija su área" en Nuevo Requerimiento — ya se sabe cuál es.
export async function getMyArea(establishmentId: string, roleCode: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('establishment_id', establishmentId)
    .eq('code', roleCode)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Nota importante (límite arquitectónico, no un bug): las políticas RLS de
// `requisitions` identifican el área del usuario cruzando su ROL (cocina/bar/servicio)
// contra `areas.code`. Si aquí se crea un área con un código nuevo (ej. "mantenimiento")
// sin que exista también el rol `mantenimiento` en la tabla `roles` y sin dar ese rol
// a alguien, esa área quedará visible solo para admin/coordinador — nadie podrá crear
// requerimientos para ella. Antes de agregar una área con código nuevo, hay que decidir
// si también se agrega un rol nuevo (impacto en Fase 7/RLS, no solo en este maestro).
export async function createArea(input: AreaInput) {
  const parsed = areaSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('areas').insert(parsed).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
  return data;
}

export async function updateArea(id: string, input: Partial<AreaInput>) {
  const parsed = areaSchema.partial().parse(input);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('areas').update(parsed).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
  return data;
}

export async function deactivateArea(id: string) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('areas').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}
