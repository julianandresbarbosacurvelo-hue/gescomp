'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { createProduct } from '@/lib/actions/products';
import { listCategories } from '@/lib/actions/categories';
import { listUnits } from '@/lib/actions/units';
import { useToast } from '@/lib/toast-context';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function NuevoProductoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [internalCode, setInternalCode] = useState('');
  const [brand, setBrand] = useState('');

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => listCategories() });
  const units = useQuery({ queryKey: ['units'], queryFn: () => listUnits() });

  const submitMutation = useMutation({
    mutationFn: () => createProduct({ name, category_id: categoryId, unit_id: unitId, internal_code: internalCode || undefined, preferred_brand: brand || undefined, is_active: true }),
    onSuccess: (product) => { toast('Producto creado'); router.push(`/productos/${product.id}`); },
    onError: (e: Error) => toast(e.message || 'No pudimos crear el producto.', 'error'),
  });

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Nuevo producto</h1>
        <p className="text-sm text-muted-foreground">Se agrega al catálogo compartido entre establecimientos</p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Nombre</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Categoría</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm">
                <option value="">Selecciona</option>
                {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Unidad de compra</label>
              <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-card px-3 text-sm">
                <option value="">Selecciona</option>
                {units.data?.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Código interno (opcional)</label>
            <Input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Marca preferida (opcional)</label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" disabled={!name || !categoryId || !unitId || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
        {submitMutation.isPending ? 'Creando…' : 'Crear producto'}
      </Button>
    </div>
  );
}
