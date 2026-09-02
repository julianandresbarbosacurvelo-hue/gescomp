'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Pencil, X } from 'lucide-react';
import { listEstablishments, createEstablishment, updateEstablishment, deactivateEstablishment } from '@/lib/actions/establishments';
import { useToast } from '@/lib/toast-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type EstablishmentForm = { name: string; short_code: string; nit: string; address: string; city: string };
const EMPTY_FORM: EstablishmentForm = { name: '', short_code: '', nit: '', address: '', city: '' };

export default function EstablecimientosPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EstablishmentForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['establishments'], queryFn: () => listEstablishments() });

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEdit(e: any) {
    setEditingId(e.id);
    setForm({ name: e.name ?? '', short_code: e.short_code ?? '', nit: e.nit ?? '', address: e.address ?? '', city: e.city ?? '' });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createEstablishment({
        name: form.name,
        short_code: form.short_code,
        nit: form.nit || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
      }),
    onSuccess: () => {
      toast('Establecimiento creado');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['establishments'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos crear el establecimiento.', 'error'),
  });

  // Permite corregir datos ya cargados (ej. ciudad real y prefijo de consecutivo) sin
  // necesitar acceso directo a la base de datos — ver migración 0030.
  const updateMutation = useMutation({
    mutationFn: () =>
      updateEstablishment(editingId!, {
        name: form.name,
        short_code: form.short_code,
        nit: form.nit || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
      }),
    onSuccess: () => {
      toast('Establecimiento actualizado');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['establishments'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos actualizar el establecimiento.', 'error'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateEstablishment(id),
    onSuccess: () => { toast('Establecimiento desactivado'); queryClient.invalidateQueries({ queryKey: ['establishments'] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const isEditing = !!editingId;
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h1 className="font-display text-2xl font-semibold">Establecimientos</h1>
        <p className="text-sm text-muted-foreground">Sedes de la organización</p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3">
        {isEditing && (
          <div className="flex items-center justify-between rounded-md bg-accent px-3 py-2 text-sm">
            <span>Editando establecimiento existente</span>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground" aria-label="Cancelar edición">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1.5">Nombre</label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej. Restaurante Norte" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Código corto (3-4 letras, para los consecutivos)</label>
          <Input
            value={form.short_code}
            onChange={(e) => setForm((f) => ({ ...f, short_code: e.target.value }))}
            placeholder="Ej. NOR"
            maxLength={4}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Se usa en los códigos de requerimientos/órdenes, ej. REQ-{form.short_code.toUpperCase() || 'NOR'}-2026-0001. Cambiarlo
            solo afecta los códigos nuevos — los ya emitidos no cambian.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Ciudad</label>
          <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Ej. Villavicencio" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">NIT (opcional)</label>
          <Input value={form.nit} onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Dirección (opcional)</label>
          <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <Button
            disabled={!form.name.trim() || !form.short_code.trim() || saving}
            onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
          >
            <PlusCircle className="h-4 w-4" /> {isEditing ? (saving ? 'Guardando…' : 'Guardar cambios') : 'Crear establecimiento'}
          </Button>
          {isEditing && (
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data?.map((e: any) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 bg-card">
              <div>
                <p className={cn('text-sm font-medium', !e.is_active && 'text-muted-foreground line-through')}>{e.name}</p>
                <p className="text-xs text-muted-foreground">
                  {e.short_code}
                  {e.city ? ` · ${e.city}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={e.is_active ? 'secondary' : 'outline'}>{e.is_active ? 'Activo' : 'Inactivo'}</Badge>
                <button onClick={() => startEdit(e)} className="text-muted-foreground hover:text-foreground" aria-label="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {e.is_active && (
                  <button onClick={() => deactivateMutation.mutate(e.id)} className="text-xs text-muted-foreground hover:text-destructive">
                    Desactivar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
