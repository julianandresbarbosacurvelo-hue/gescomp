'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, PlusCircle } from 'lucide-react';
import { listProducts } from '@/lib/actions/products';
import { listCategories } from '@/lib/actions/categories';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/business/EmptyState';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ProductosPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [categoryId, setCategoryId] = useState('');

  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const { data, isLoading } = useQuery({
    queryKey: ['products', debouncedSearch, categoryId],
    queryFn: () => listProducts({ search: debouncedSearch || undefined, categoryId: categoryId || undefined }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Productos</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? '…'} referencias en el catálogo</p>
        </div>
        <a href="/productos/nuevo" className={buttonVariants()}><PlusCircle className="h-4 w-4" /> Nuevo producto</a>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-3 text-sm" />
        </div>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm">
          <option value="">Todas las categorías</option>
          {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Package} title="Sin productos" description="Ajusta la búsqueda o crea un nuevo producto." />
      ) : (
        <>
          {data.length === 100 && (
            <p className="text-xs text-muted-foreground">
              Mostrando los primeros 100 resultados — usa el buscador o filtra por categoría para encontrar otros.
            </p>
          )}
          <div className="rounded-lg border border-border overflow-hidden">
            {data.map((p: any) => (
              <a key={p.id} href={`/productos/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0 bg-card hover:bg-accent">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.category?.name} · {p.unit?.code}</p>
                </div>
                <Badge variant={p.is_active ? 'secondary' : 'outline'} className={cn(!p.is_active && 'opacity-60')}>
                  {p.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
