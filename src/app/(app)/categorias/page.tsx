'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tags, PlusCircle, Pencil, Check, X } from 'lucide-react';
import { listCategories, createCategory, updateCategory, deactivateCategory } from '@/lib/actions/categories';
import { useToast } from '@/lib/toast-context';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { ErrorState } from '@/components/business/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function CategoriasPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['categories'], queryFn: () => listCategories() });

  // createCategory/updateCategory devuelven { data } | { error } en vez de lanzar con
  // `throw` — Next.js redacta en producción el mensaje de cualquier error lanzado desde
  // un Server Action (el cliente solo ve "Server Components render error", genérico e
  // inútil para el usuario). Al venir como dato, el mensaje llega intacto; acá se
  // relanza como Error de JS normal para que react-query lo capture en onError y
  // muestre el toast de siempre.
  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await createCategory({ name: newName, is_active: true });
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast('Categoría creada');
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos crear la categoría.', 'error'),
  });

  // Antes solo existía createCategory/deactivateCategory en la UI — updateCategory ya
  // existía en el backend (categories.ts) pero nunca se exponía para renombrar, así que
  // un nombre mal escrito o duplicado quedaba fijo para siempre. La BD ya tiene un unique
  // constraint en categories.name (Fase 6), así que un duplicado simplemente falla acá
  // con un mensaje claro en vez de crear un registro corrupto.
  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const result = await updateCategory(id, { name });
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast('Categoría actualizada');
      setEditingId(null);
      setEditingName('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos actualizar la categoría.', 'error'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateCategory(id),
    onSuccess: () => { toast('Categoría desactivada'); queryClient.invalidateQueries({ queryKey: ['categories'] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  function startEditing(id: string, currentName: string) {
    setEditingId(id);
    setEditingName(currentName);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingName('');
  }

  function saveEditing(id: string) {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    updateMutation.mutate({ id, name: trimmed });
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h1 className="font-display text-2xl font-semibold">Categorías</h1>
        <p className="text-sm text-muted-foreground">Clasificación del catálogo de productos</p>
      </div>

      <div className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nueva categoría…" />
        <Button disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
          <PlusCircle className="h-4 w-4" /> Agregar
        </Button>
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Tags} title="Sin categorías" description="Agrega la primera desde el formulario de arriba." />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 bg-card">
              {editingId === c.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEditing(c.id);
                      if (e.key === 'Escape') cancelEditing();
                    }}
                    className="h-8"
                  />
                  <button
                    onClick={() => saveEditing(c.id)}
                    disabled={updateMutation.isPending || !editingName.trim()}
                    className="text-status-verde hover:opacity-80 disabled:opacity-40"
                    aria-label="Guardar nombre"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={cancelEditing} className="text-muted-foreground hover:text-foreground" aria-label="Cancelar edición">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <span className={cn('text-sm', !c.is_active && 'text-muted-foreground line-through')}>{c.name}</span>
              )}
              {editingId !== c.id && (
                <div className="flex items-center gap-2">
                  <Badge variant={c.is_active ? 'secondary' : 'outline'}>{c.is_active ? 'Activa' : 'Inactiva'}</Badge>
                  <button onClick={() => startEditing(c.id, c.name)} className="text-muted-foreground hover:text-primary" aria-label={`Editar ${c.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {c.is_active && (
                    <button onClick={() => deactivateMutation.mutate(c.id)} className="text-xs text-muted-foreground hover:text-destructive">
                      Desactivar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
