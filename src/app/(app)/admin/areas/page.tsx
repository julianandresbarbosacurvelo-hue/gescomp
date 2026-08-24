'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { listAreas, createArea, deactivateArea } from '@/lib/actions/areas';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { useToast } from '@/lib/toast-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function AreasAdminPage() {
  const { activeEstablishmentId } = useEstablishmentStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['areas', activeEstablishmentId],
    queryFn: () => listAreas(activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });

  const createMutation = useMutation({
    mutationFn: () => createArea({ establishment_id: activeEstablishmentId!, code, name, is_active: true }),
    onSuccess: () => {
      toast('Área creada — recuerda que necesita un rol con el mismo código para que alguien pueda solicitar en ella');
      setName(''); setCode('');
      queryClient.invalidateQueries({ queryKey: ['areas'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos crear el área.', 'error'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateArea(id),
    onSuccess: () => { toast('Área desactivada'); queryClient.invalidateQueries({ queryKey: ['areas'] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Áreas</h1>
        <p className="text-sm text-muted-foreground">De este establecimiento</p>
      </div>

      <div className="flex gap-2">
        <Input placeholder="Código (ej. mantenimiento)" value={code} onChange={(e) => setCode(e.target.value)} className="max-w-[180px]" />
        <Input placeholder="Nombre visible" value={name} onChange={(e) => setName(e.target.value)} />
        <Button disabled={!name.trim() || !code.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
          <PlusCircle className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        El código debe coincidir con el de un rol existente (`roles.code`) para que alguien pueda crear requerimientos en esta área — es una regla de RLS del backend, no solo de este formulario.
      </p>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data?.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 bg-card">
              <span className={cn('text-sm', !a.is_active && 'text-muted-foreground line-through')}>{a.name} <span className="text-xs text-muted-foreground">({a.code})</span></span>
              <div className="flex items-center gap-2">
                <Badge variant={a.is_active ? 'secondary' : 'outline'}>{a.is_active ? 'Activa' : 'Inactiva'}</Badge>
                {a.is_active && <button onClick={() => deactivateMutation.mutate(a.id)} className="text-xs text-muted-foreground hover:text-destructive">Desactivar</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
