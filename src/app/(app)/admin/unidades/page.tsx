'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { listUnits, createUnit } from '@/lib/actions/units';
import { useToast } from '@/lib/toast-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function UnidadesAdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['units'], queryFn: listUnits });

  const createMutation = useMutation({
    mutationFn: () => createUnit({ code, name }),
    onSuccess: () => {
      toast('Unidad creada');
      setCode(''); setName('');
      queryClient.invalidateQueries({ queryKey: ['units'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos crear la unidad.', 'error'),
  });

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
              <span>{u.name}</span>
              <span className="text-muted-foreground font-mono text-xs">{u.code}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
