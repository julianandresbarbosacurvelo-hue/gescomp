'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus, Pencil, Check, X, KeyRound, Mail, RotateCcw, UserSearch,
  MoreVertical, UserMinus, ShieldOff, AlertTriangle,
} from 'lucide-react';
import {
  listUsers, createUserWithRole, removeRole, deactivateUser, reactivateUser,
  updateUserProfile, searchUserByEmail, assignRole, sendPasswordResetEmail, setTemporaryPassword,
} from '@/lib/actions/users';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { useSession } from '@/lib/session-context';
import { useToast } from '@/lib/toast-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador', coordinador_compras: 'Coordinador de compras',
  cocina: 'Cocina', bar: 'Bar', servicio: 'Servicio',
};

type PendingConfirm = { kind: 'deactivate' | 'removeRole'; userRoleId: string; userId: string } | null;

export default function UsuariosPage() {
  const { activeEstablishmentId } = useEstablishmentStore();
  const session = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Sucursales donde quien tiene la sesión es admin — son las únicas donde
  // puede asignar roles (el backend lo vuelve a verificar en `assertIsAdmin`,
  // esto solo evita mostrar opciones que de todas formas fallarían al enviar).
  const adminEstablishments = Array.from(
    new Map(
      session.roles
        .filter((r) => r.roleCode === 'admin')
        .map((r) => [r.establishmentId, r.establishmentName] as const)
    ).entries()
  ).map(([id, name]) => ({ id, name }));

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [roleCode, setRoleCode] = useState('cocina');
  const [createEstablishmentIds, setCreateEstablishmentIds] = useState<string[]>([]);

  // Marca la sucursal activa como preseleccionada apenas sepamos cuál es —
  // sin forzarla de nuevo si el admin ya la destildó a propósito.
  useEffect(() => {
    if (activeEstablishmentId) {
      setCreateEstablishmentIds((prev) => (prev.length === 0 ? [activeEstablishmentId] : prev));
    }
  }, [activeEstablishmentId]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const [searchEmail, setSearchEmail] = useState('');
  const [foundUser, setFoundUser] = useState<{ id: string; full_name: string; email: string } | null | undefined>(undefined);
  const [assignRoleCode, setAssignRoleCode] = useState('cocina');
  const [assignEstablishmentId, setAssignEstablishmentId] = useState('');

  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState('');

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const { data, isLoading } = useQuery({
    queryKey: ['users', activeEstablishmentId],
    queryFn: () => listUsers(activeEstablishmentId!),
    enabled: !!activeEstablishmentId,
  });

  const createMutation = useMutation({
    mutationFn: () => createUserWithRole({
      email, full_name: fullName, password, role_code: roleCode as any, establishment_ids: createEstablishmentIds,
    }),
    onSuccess: () => {
      toast('Usuario creado — ya puede iniciar sesión con la contraseña que definiste');
      setEmail(''); setFullName(''); setPassword('');
      invalidateUsers();
    },
    onError: (e: Error) => toast(e.message || 'No pudimos crear el usuario.', 'error'),
  });

  const removeRoleMutation = useMutation({
    mutationFn: (userRoleId: string) => removeRole(userRoleId, activeEstablishmentId!),
    onSuccess: () => { toast('Rol removido'); setPendingConfirm(null); invalidateUsers(); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => deactivateUser(userId, activeEstablishmentId!),
    onSuccess: () => { toast('Usuario desactivado'); setPendingConfirm(null); invalidateUsers(); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (userId: string) => reactivateUser(userId, activeEstablishmentId!),
    onSuccess: () => { toast('Usuario reactivado'); invalidateUsers(); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (userId: string) => updateUserProfile(userId, { fullName: editName, email: editEmail }, activeEstablishmentId!),
    onSuccess: () => { toast('Datos actualizados'); setEditingId(null); invalidateUsers(); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const searchMutation = useMutation({
    mutationFn: () => searchUserByEmail(searchEmail, activeEstablishmentId!),
    onSuccess: (result) => {
      setFoundUser(result ?? null);
      // Sucursal por defecto al encontrar a alguien: la activa, si es una de
      // las que administras — si no, la primera donde sí eres admin.
      setAssignEstablishmentId(
        adminEstablishments.some((e) => e.id === activeEstablishmentId)
          ? activeEstablishmentId!
          : adminEstablishments[0]?.id ?? ''
      );
    },
    onError: (e: Error) => { toast(e.message, 'error'); setFoundUser(null); },
  });

  const assignEstablishmentName = adminEstablishments.find((e) => e.id === assignEstablishmentId)?.name ?? '';

  const assignExistingMutation = useMutation({
    mutationFn: () => assignRole({ user_id: foundUser!.id, role_code: assignRoleCode as any, establishment_id: assignEstablishmentId }),
    onSuccess: () => {
      toast(`Rol asignado en ${assignEstablishmentName || 'la sucursal seleccionada'}`);
      setSearchEmail(''); setFoundUser(undefined);
      invalidateUsers();
    },
    onError: (e: Error) => toast(e.message || 'No pudimos asignar el rol (¿ya lo tenía en esa sucursal?)', 'error'),
  });

  const sendResetLinkMutation = useMutation({
    mutationFn: (userEmail: string) => sendPasswordResetEmail(userEmail, activeEstablishmentId!),
    onSuccess: () => { toast('Enlace de restablecimiento enviado por correo'); setOpenMenuId(null); },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const setTempPasswordMutation = useMutation({
    mutationFn: (userId: string) => setTemporaryPassword(userId, activeEstablishmentId!, tempPassword),
    onSuccess: () => {
      toast('Contraseña temporal establecida — comunícasela a la persona de forma segura');
      setPasswordUserId(null); setTempPassword('');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  function startEdit(user: { id: string; full_name: string; email: string }) {
    setEditingId(user.id);
    setEditName(user.full_name);
    setEditEmail(user.email);
    setOpenMenuId(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">Cuentas y roles de este establecimiento</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Crear usuario nuevo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Input placeholder="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Input type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Input
              type="text" placeholder="Contraseña (mín. 8 caracteres)"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm">
              {Object.entries(ROLE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Sucursales con acceso (mismo rol en cada una):</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {adminEstablishments.length === 0 && (
                <p className="text-xs text-status-rojo">No administras ninguna sucursal — no puedes crear usuarios.</p>
              )}
              {adminEstablishments.map((est) => (
                <label key={est.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={createEstablishmentIds.includes(est.id)}
                    onChange={(e) => {
                      setCreateEstablishmentIds((prev) =>
                        e.target.checked ? [...prev, est.id] : prev.filter((id) => id !== est.id)
                      );
                    }}
                    className="h-3.5 w-3.5 rounded border-input"
                  />
                  {est.name}
                </label>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            La cuenta queda lista de inmediato con esta contraseña — no se envía correo de invitación.
            Comunícasela a la persona de forma segura.
          </p>
          <Button
            disabled={!email || !fullName || password.length < 8 || createEstablishmentIds.length === 0 || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Creando…' : 'Crear usuario'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserSearch className="h-4 w-4" /> Agregar sucursal a un usuario existente</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Para alguien que ya tiene cuenta en otra sucursal y necesita también acceso aquí
            (ej. un coordinador que atiende ambas sedes). Al encontrarlo, eliges tanto la
            sucursal como el rol que tendrá ahí — solo puedes asignar en sucursales donde tú
            mismo eres administrador.
          </p>
          <div className="flex gap-2">
            <Input
              type="email" placeholder="Correo del usuario existente"
              value={searchEmail}
              onChange={(e) => { setSearchEmail(e.target.value); setFoundUser(undefined); }}
            />
            <Button variant="outline" disabled={!searchEmail.trim() || searchMutation.isPending} onClick={() => searchMutation.mutate()}>
              Buscar
            </Button>
          </div>

          {foundUser === null && (
            <p className="text-sm text-status-rojo">No se encontró ningún usuario con ese correo.</p>
          )}

          {foundUser && (
            <div className="rounded-md border border-border p-3 space-y-2">
              <div>
                <p className="text-sm font-medium">{foundUser.full_name}</p>
                <p className="text-xs text-muted-foreground">{foundUser.email}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-muted-foreground shrink-0">Sucursal:</label>
                <select
                  value={assignEstablishmentId}
                  onChange={(e) => setAssignEstablishmentId(e.target.value)}
                  className="h-9 rounded-md border border-input bg-card px-2 text-sm"
                >
                  {adminEstablishments.length === 0 && <option value="">— sin sucursales administradas —</option>}
                  {adminEstablishments.map((est) => (
                    <option key={est.id} value={est.id}>{est.name}</option>
                  ))}
                </select>
                <label className="text-xs text-muted-foreground shrink-0">Rol:</label>
                <select value={assignRoleCode} onChange={(e) => setAssignRoleCode(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
                  {Object.entries(ROLE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
                <Button size="sm" disabled={assignExistingMutation.isPending || !assignEstablishmentId} onClick={() => assignExistingMutation.mutate()}>
                  Asignar
                </Button>
              </div>
              {['cocina', 'bar', 'servicio'].includes(assignRoleCode) && (
                <p className="text-xs text-muted-foreground italic">
                  Nota: "{ROLE_LABELS[assignRoleCode]}" es un rol de acceso al sistema — coincide en
                  nombre con el área del restaurante, pero es una elección distinta (aquí eliges el
                  ROL, no un área específica).
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sin usuarios en este establecimiento todavía.</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {data.map((ur: any) => (
            <UserRow
              key={ur.id}
              ur={ur}
              editingId={editingId}
              editName={editName}
              editEmail={editEmail}
              setEditName={setEditName}
              setEditEmail={setEditEmail}
              onStartEdit={() => startEdit(ur.user)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={() => updateProfileMutation.mutate(ur.user.id)}
              savingEdit={updateProfileMutation.isPending}
              openMenuId={openMenuId}
              setOpenMenuId={setOpenMenuId}
              pendingConfirm={pendingConfirm}
              setPendingConfirm={setPendingConfirm}
              onDeactivate={() => deactivateMutation.mutate(ur.user.id)}
              onReactivate={() => reactivateMutation.mutate(ur.user.id)}
              onRemoveRole={() => removeRoleMutation.mutate(ur.id)}
              actionPending={deactivateMutation.isPending || removeRoleMutation.isPending}
              passwordUserId={passwordUserId}
              setPasswordUserId={setPasswordUserId}
              tempPassword={tempPassword}
              setTempPassword={setTempPassword}
              onSetTempPassword={() => setTempPasswordMutation.mutate(ur.user.id)}
              settingTempPassword={setTempPasswordMutation.isPending}
              onSendResetLink={() => sendResetLinkMutation.mutate(ur.user.email)}
              sendingResetLink={sendResetLinkMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({
  ur, editingId, editName, editEmail, setEditName, setEditEmail, onStartEdit, onCancelEdit, onSaveEdit, savingEdit,
  openMenuId, setOpenMenuId, pendingConfirm, setPendingConfirm, onDeactivate, onReactivate, onRemoveRole, actionPending,
  passwordUserId, setPasswordUserId, tempPassword, setTempPassword, onSetTempPassword, settingTempPassword,
  onSendResetLink, sendingResetLink,
}: any) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isMenuOpen = openMenuId === ur.id;
  const isEditing = editingId === ur.user?.id;
  const isConfirmingDeactivate = pendingConfirm?.kind === 'deactivate' && pendingConfirm.userId === ur.user?.id;
  const isConfirmingRemove = pendingConfirm?.kind === 'removeRole' && pendingConfirm.userRoleId === ur.id;

  useEffect(() => {
    // Este listener solo debe existir (y solo debe poder cerrar el menú)
    // mientras el menú DE ESTA FILA está abierto. Antes se registraba sin
    // condición, en TODAS las filas a la vez — así que al hacer clic dentro
    // del menú de la fila A, los listeners de las filas B y C (con sus propios
    // menuRef, que obviamente no contienen ese clic) concluían "esto fue
    // afuera" y llamaban setOpenMenuId(null), cerrando el menú de A antes de
    // que su propio clic llegara a dispararse sobre el ítem.
    if (!isMenuOpen) return;

    function onClickOutside(e: MouseEvent) {
      // Solo cerramos si el clic fue AFUERA del menú Y afuera del botón que lo abre.
      // Antes, un mousedown real (a diferencia de un click simulado por JS) podía
      // hacer que este handler corriera ANTES de que el navegador terminara de
      // procesar el clic sobre un ítem del menú, cerrando el menú (desmontando el
      // <div role="menu">) antes de que el evento "click" llegara a dispararse
      // sobre ese ítem — el ítem quedaba huérfano a mitad de la interacción.
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    // 'click' en vez de 'mousedown': deja que el ítem termine de procesar su
    // propio evento "click" (que ocurre DESPUÉS de mousedown) antes de que
    // este listener evalúe si debe cerrar el menú.
    document.addEventListener('click', onClickOutside, true);
    return () => document.removeEventListener('click', onClickOutside, true);
  }, [isMenuOpen, setOpenMenuId]);

  return (
    <div className="px-4 py-3 bg-card">
      <div className="flex items-center justify-between gap-3">
        {isEditing ? (
          <div className="flex-1 space-y-2">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre completo" className="h-8" />
            <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Correo" type="email" className="h-8" />
            <div className="flex gap-2">
              <Button size="sm" disabled={!editName.trim() || !editEmail.trim() || savingEdit} onClick={onSaveEdit}>
                <Check className="h-3.5 w-3.5" /> Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                <X className="h-3.5 w-3.5" /> Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{ur.user?.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{ur.user?.email}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="secondary">{ROLE_LABELS[ur.role?.code] ?? ur.role?.code}</Badge>
              {!ur.user?.is_active && <Badge variant="outline">Inactivo</Badge>}

              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setOpenMenuId(isMenuOpen ? null : ur.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Más acciones" aria-haspopup="menu" aria-expanded={isMenuOpen}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {isMenuOpen && (
                  <div role="menu" className="absolute right-0 mt-1 w-56 rounded-md border border-border bg-card shadow-card py-1 z-50">
                    <MenuItem icon={Pencil} label="Editar nombre y correo" onClick={onStartEdit} />
                    <MenuItem
                      icon={Mail} label="Reenviar enlace de contraseña"
                      onClick={onSendResetLink} disabled={sendingResetLink}
                    />
                    <MenuItem
                      icon={KeyRound} label="Fijar contraseña temporal"
                      onClick={() => { setPasswordUserId(ur.user.id); setOpenMenuId(null); }}
                    />
                    <div className="my-1 border-t border-border" />
                    {ur.user?.is_active ? (
                      <MenuItem
                        icon={ShieldOff} label="Desactivar usuario" destructive
                        onClick={() => { setPendingConfirm({ kind: 'deactivate', userRoleId: ur.id, userId: ur.user.id }); setOpenMenuId(null); }}
                      />
                    ) : (
                      <MenuItem icon={RotateCcw} label="Reactivar usuario" onClick={() => { onReactivate(); setOpenMenuId(null); }} />
                    )}
                    <MenuItem
                      icon={UserMinus} label="Quitar rol en esta sucursal" destructive
                      onClick={() => { setPendingConfirm({ kind: 'removeRole', userRoleId: ur.id, userId: ur.user.id }); setOpenMenuId(null); }}
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {isConfirmingDeactivate && (
        <ConfirmBar
          message={`¿Desactivar a ${ur.user?.full_name}? No podrá iniciar sesión hasta que lo reactives.`}
          confirmLabel="Sí, desactivar"
          onConfirm={onDeactivate}
          onCancel={() => setPendingConfirm(null)}
          pending={actionPending}
        />
      )}

      {isConfirmingRemove && (
        <ConfirmBar
          message={`¿Quitar el rol de ${ROLE_LABELS[ur.role?.code] ?? ur.role?.code} de ${ur.user?.full_name} en esta sucursal?`}
          confirmLabel="Sí, quitar"
          onConfirm={onRemoveRole}
          onCancel={() => setPendingConfirm(null)}
          pending={actionPending}
        />
      )}

      {passwordUserId === ur.user?.id && (
        <div className="flex items-center gap-2 rounded-md border border-border p-2 bg-accent/30 mt-2">
          <Input
            type="text" placeholder="Contraseña temporal (mín. 8 caracteres)"
            value={tempPassword} onChange={(e) => setTempPassword(e.target.value)}
            className="h-8 text-sm"
          />
          <Button size="sm" disabled={tempPassword.length < 8 || settingTempPassword} onClick={onSetTempPassword}>
            Fijar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPasswordUserId(null)}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, disabled, destructive }: {
  icon: any; label: string; onClick: () => void; disabled?: boolean; destructive?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent disabled:opacity-50',
        destructive ? 'text-destructive' : 'text-foreground'
      )}
    >
      <Icon className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}

function ConfirmBar({ message, confirmLabel, onConfirm, onCancel, pending }: {
  message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; pending?: boolean;
}) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-status-naranja/30 bg-status-naranja/5 p-2.5">
      <AlertTriangle className="h-4 w-4 text-status-naranja shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 space-y-1.5">
        <p className="text-xs">{message}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="destructive" disabled={pending} onClick={onConfirm}>{confirmLabel}</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
}
