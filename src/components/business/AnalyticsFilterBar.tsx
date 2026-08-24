'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { listSuppliers } from '@/lib/actions/suppliers';
import { listCategories } from '@/lib/actions/categories';
import { listProducts } from '@/lib/actions/products';
import { listAreas } from '@/lib/actions/areas';
import { X } from 'lucide-react';

const PERIODS = [
  { value: '', label: 'Últimos 12 meses' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: '365', label: 'Último año' },
];

export function AnalyticsFilterBar({ establishmentId }: { establishmentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: listSuppliers });
  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const products = useQuery({ queryKey: ['products'], queryFn: () => listProducts({ activeOnly: true }) });
  const areas = useQuery({ queryKey: ['areas', establishmentId], queryFn: () => listAreas(establishmentId), enabled: !!establishmentId });

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    value ? params.set(key, value) : params.delete(key);
    router.push(`/analitica?${params.toString()}`);
  }

  const activeCount = ['periodo', 'proveedor', 'producto', 'categoria', 'area'].filter((k) => searchParams.get(k)).length;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
      <select value={searchParams.get('periodo') ?? ''} onChange={(e) => setParam('periodo', e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
        {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>

      <select value={searchParams.get('proveedor') ?? ''} onChange={(e) => setParam('proveedor', e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm max-w-[160px]">
        <option value="">Todos los proveedores</option>
        {suppliers.data?.map((s: any) => <option key={s.id} value={s.id}>{s.trade_name ?? s.legal_name}</option>)}
      </select>

      <select value={searchParams.get('categoria') ?? ''} onChange={(e) => setParam('categoria', e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm max-w-[160px]">
        <option value="">Todas las categorías</option>
        {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <select value={searchParams.get('producto') ?? ''} onChange={(e) => setParam('producto', e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm max-w-[160px]">
        <option value="">Todos los productos</option>
        {products.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <select value={searchParams.get('area') ?? ''} onChange={(e) => setParam('area', e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm max-w-[160px]">
        <option value="">Todas las áreas</option>
        {areas.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>

      {activeCount > 0 && (
        <button onClick={() => router.push('/analitica')} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive">
          <X className="h-3.5 w-3.5" /> Limpiar filtros ({activeCount})
        </button>
      )}
    </div>
  );
}
