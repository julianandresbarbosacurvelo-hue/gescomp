'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { listEstablishments, createEstablishment, deactivateEstablishment } from '@/lib/actions/establishments';
import { useToast } from '@/lib/toast-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function EstablecimientosPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [nit, setNit] = useState('');
  const [address, setAddress] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['establishments'], queryFn: () => listEstablishments() });

  const createMutation = useMutation({
    mutationFn: () => createEstablishment({ name, short_code: shortCode, nit: nit || undefined, address: address || undefined }),
    onSuccess: () => {
      toast('Establecimiento creado');
      setName(''); setShortCode(''); setNit(''); setAddress('');
      queryClient.invalidateQueries({ queryKey: ['establishments'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos crear el establecimiento.', 'error'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateEstablishment(id),
    onSuccess: () => { toast('Establecimiento desactivado'); queryClient.invalidateQueries({ queryKey: ['establishments'] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h1 className="font-display text-2xl font-semibold">Establecimientos</h1>
        <p className="text-sm text-muted-foreground">Sedes de la organización</p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1.5">Nombre</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Restaurante Norte" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Código corto (3-4 letras, para los consecutivos)</label>
          <Input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="Ej. NOR" maxLength={4} />
          <p className="mt-1 text-xs text-muted-foreground">Se usa en los códigos de requerimientos/órdenes, ej. REQ-{shortCode.toUpperCase() || 'NOR'}-0001</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">NIT (opcional)</label>
          <Input value={nit} onChange={(e) => setNit(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Dirección (opcional)</label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <Button disabled={!name.trim() || !shortCode.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
          <PlusCircle className="h-4 w-4" /> Crear establecimiento
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data?.map((e: any) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 bg-card">
              <div>
                <p className={cn('text-sm font-medium', !e.is_active && 'text-muted-foreground line-through')}>{e.name}</p>
                <p className="text-xs text-muted-foreground">{e.short_code}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={e.is_active ? 'secondary' : 'outline'}>{e.is_active ? 'Activo' : 'Inactivo'}</Badge>
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
