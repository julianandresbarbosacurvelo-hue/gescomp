'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Building2, PlusCircle } from 'lucide-react';
import { listSuppliers } from '@/lib/actions/suppliers';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';

export default function ProveedoresPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: () => listSuppliers() });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((s: any) => (s.trade_name ?? s.legal_name).toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Proveedores</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} proveedor{filtered.length === 1 ? '' : 'es'}</p>
        </div>
        <a href="/proveedores/nuevo" className={buttonVariants()}><PlusCircle className="h-4 w-4" /> Nuevo proveedor</a>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar proveedor…" className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-3 text-sm" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} title="Sin proveedores" description="Agrega el primero para empezar a generar órdenes." actionLabel="Nuevo proveedor" actionHref="/proveedores/nuevo" />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {filtered.map((s: any) => (
            <a key={s.id} href={`/proveedores/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0 bg-card hover:bg-accent">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.trade_name ?? s.legal_name}</p>
                <p className="text-xs text-muted-foreground">{s.contact_name ?? s.nit ?? '—'}</p>
              </div>
              <Badge variant={s.is_active ? 'secondary' : 'outline'}>{s.is_active ? 'Activo' : 'Inactivo'}</Badge>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
