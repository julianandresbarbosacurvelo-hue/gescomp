'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2 } from 'lucide-react';
import { listUsers, createUserWithRole, removeRole, deactivateUser } from '@/lib/actions/users';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { useToast } from '@/lib/toast-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador', coordinador_compras: 'Coordinador de compras',
  cocina: 'Cocina', bar: 'Bar', servicio: 'Servicio',
};

export default function UsuariosPage() {
  const { activeEstablishmentId } = useEstablishmentStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleCode, setRoleCode] = useState('cocina');

  const { data, isLoading } = useQuery({
    queryKey: ['users', activeEstablishmentId],
    queryFn: () => listUsers(activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });

  const createMutation = useMutation({
    mutationFn: () => createUserWithRole({ email, full_name: fullName, role_code: roleCode as any, establishment_id: activeEstablishmentId! }),
    onSuccess: () => {
      toast('Usuario invitado — recibirá un correo para activar su cuenta');
      setEmail(''); setFullName('');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: Error) => toast(e.message || 'No pudimos crear el usuario.', 'error'),
  });

  const removeRoleMutation = useMutation({
    mutationFn: (userRoleId: string) => removeRole(userRoleId, activeEstablishmentId!),
    onSuccess: () => { toast('Rol removido'); queryClient.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => deactivateUser(userId, activeEstablishmentId!),
    onSuccess: () => { toast('Usuario desactivado'); queryClient.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">Cuentas y roles de este establecimiento</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Invitar usuario</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <Input placeholder="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Input type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm">
              {Object.entries(ROLE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Se envía una invitación por correo a la cuenta de Supabase Auth — la persona define su contraseña al aceptar.
          </p>
          <Button disabled={!email || !fullName || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? 'Invitando…' : 'Invitar'}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sin usuarios en este establecimiento todavía.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data.map((ur: any) => (
            <div key={ur.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0 bg-card">
              <div>
                <p className="text-sm font-medium">{ur.user?.full_name}</p>
                <p className="text-xs text-muted-foreground">{ur.user?.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{ROLE_LABELS[ur.role?.code] ?? ur.role?.code}</Badge>
                {!ur.user?.is_active && <Badge variant="outline">Inactivo</Badge>}
                <button onClick={() => removeRoleMutation.mutate(ur.id)} className="text-muted-foreground hover:text-destructive p-1" aria-label="Quitar rol">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                {ur.user?.is_active && (
                  <button onClick={() => deactivateMutation.mutate(ur.user.id)} className="text-xs text-muted-foreground hover:text-destructive ml-1">
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
