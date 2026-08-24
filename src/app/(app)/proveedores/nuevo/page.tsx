'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { createSupplier } from '@/lib/actions/suppliers';
import { useToast } from '@/lib/toast-context';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function NuevoProveedorPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({
    legal_name: '', trade_name: '', nit: '', contact_name: '', phone: '', whatsapp: '', email: '',
  });

  const submitMutation = useMutation({
    mutationFn: () => createSupplier({ ...form, is_active: true }),
    onSuccess: (supplier) => { toast('Proveedor creado'); router.push(`/proveedores/${supplier.id}`); },
    onError: (e: Error) => toast(e.message || 'No pudimos crear el proveedor.', 'error'),
  });

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Nuevo proveedor</h1>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Razón social</label>
            <Input value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Nombre comercial (opcional)</label>
            <Input value={form.trade_name} onChange={(e) => set('trade_name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">NIT</label>
              <Input value={form.nit} onChange={(e) => set('nit', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Contacto</label>
              <Input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Teléfono</label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">WhatsApp</label>
              <Input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Correo</label>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" disabled={!form.legal_name || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
        {submitMutation.isPending ? 'Creando…' : 'Crear proveedor'}
      </Button>
    </div>
  );
}
