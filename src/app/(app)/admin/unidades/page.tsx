'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, Pencil, Check, X } from 'lucide-react';
import { listUnits, createUnit, updateUnit } from '@/lib/actions/units';
import { useToast } from '@/lib/toast-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function UnidadesAdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['units'], queryFn: () => listUnits() });

  const createMutation = useMutation({
    mutationFn: () => createUnit({ code, name }),
    onSuccess: () => {
      toast('Unidad creada');
      setCode(''); setName('');
      queryClient.invalidateQueries({ queryKey: ['units'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos crear la unidad.', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) => updateUnit(id, { code: editCode, name: editName }),
    onSuccess: () => {
      toast('Unidad actualizada');
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['units'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos actualizar la unidad.', 'error'),
  });

  function startEdit(unit: { id: string; code: string; name: string }) {
    setEditingId(unit.id);
    setEditCode(unit.code);
    setEditName(unit.name);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Unidades</h1>
        <p className="text-sm text-muted-foreground">Unidades de compra del catálogo</p>
      </div>

      <div className="flex gap-2">
        <Input placeholder="Código (ej. kg)" value={code} onChange={(e) => setCode(e.target.value)} className="max-w-[140px]" />
        <Input placeholder="Nombre (ej. Kilogramo)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={!code.trim() || !name.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
          <PlusCircle className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data?.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 bg-card text-sm">
              {editingId === u.id ? (
                <>
                  <div className="flex gap-2 flex-1 mr-2">
                    <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} className="max-w-[100px] h-8" />
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm" variant="ghost" className="h-8 w-8 p-0"
                      disabled={!editCode.trim() || !editName.trim() || updateMutation.isPending}
                      onClick={() => updateMutation.mutate(u.id)}
                      aria-label="Guardar"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={cancelEdit} aria-label="Cancelar">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span>{u.name}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-muted-foreground font-mono text-xs">{u.code}</span>
                    <Button
                      size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={() => startEdit(u)}
                      aria-label={`Editar ${u.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
