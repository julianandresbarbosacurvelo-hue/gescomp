'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tags, PlusCircle } from 'lucide-react';
import { listCategories, createCategory, deactivateCategory } from '@/lib/actions/categories';
import { useToast } from '@/lib/toast-context';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function CategoriasPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['categories'], queryFn: listCategories });

  const createMutation = useMutation({
    mutationFn: () => createCategory({ name: newName, is_active: true }),
    onSuccess: () => {
      toast('Categoría creada');
      setNewName('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos crear la categoría.', 'error'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateCategory(id),
    onSuccess: () => { toast('Categoría desactivada'); queryClient.invalidateQueries({ queryKey: ['categories'] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

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

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Tags} title="Sin categorías" description="Agrega la primera desde el formulario de arriba." />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 bg-card">
              <span className={cn('text-sm', !c.is_active && 'text-muted-foreground line-through')}>{c.name}</span>
              <div className="flex items-center gap-2">
                <Badge variant={c.is_active ? 'secondary' : 'outline'}>{c.is_active ? 'Activa' : 'Inactiva'}</Badge>
                {c.is_active && (
                  <button onClick={() => deactivateMutation.mutate(c.id)} className="text-xs text-muted-foreground hover:text-destructive">
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
