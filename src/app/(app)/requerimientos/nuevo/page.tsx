'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, PackagePlus, ShoppingCart } from 'lucide-react';
import { listCategories } from '@/lib/actions/categories';
import { listProductsByCategory, searchProducts } from '@/lib/actions/products';
import { getMyArea } from '@/lib/actions/areas';
import { createRequisition } from '@/lib/actions/requisitions';
import { useSession } from '@/lib/session-context';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { getActiveRoleCodes } from '@/lib/session-utils';
import { useToast } from '@/lib/toast-context';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { ProductCard } from '@/components/business/ProductCard';
import { CartDrawer } from '@/components/business/CartDrawer';
import { UnregisteredProductModal } from './UnregisteredProductModal';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { CartItem } from './cart-types';

export default function NewRequisitionPage() {
  const session = useSession();
  const { activeEstablishmentId } = useEstablishmentStore();
  const establishmentId = activeEstablishmentId ?? session.roles[0]?.establishmentId ?? '';
  const roleCode = getActiveRoleCodes(session.roles, establishmentId).find((r) =>
    ['cocina', 'bar', 'servicio'].includes(r)
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [unregisteredOpen, setUnregisteredOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [requiredDate, setRequiredDate] = useState('');
  const [notes, setNotes] = useState('');

  // Borrador persistido en localStorage — si se cae la señal o el usuario cierra la
  // pestaña por accidente a medio armar un carrito, no debe perder lo que ya cargó.
  // Se guarda por usuario + establecimiento (un dispositivo puede compartirse entre
  // varios usuarios del área) y se limpia solo cuando el envío se confirma con éxito.
  const draftKey = establishmentId ? `gescomp:draft:requisicion:${session.userId}:${establishmentId}` : null;
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (!draftKey || draftRestored) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as { cart?: CartItem[]; requiredDate?: string; notes?: string };
        if (Array.isArray(draft.cart) && draft.cart.length > 0) {
          setCart(draft.cart);
          if (draft.requiredDate) setRequiredDate(draft.requiredDate);
          if (draft.notes) setNotes(draft.notes);
          toast('Recuperamos el carrito que tenías sin enviar');
        }
      }
    } catch {
      // localStorage puede fallar (modo privado, cuota llena) — no debe romper la pantalla
    }
    setDraftRestored(true);
  }, [draftKey, draftRestored, toast]);

  useEffect(() => {
    // Espera a que termine la restauración de arriba: si guardara antes, el carrito
    // vacío inicial sobrescribiría el borrador guardado antes de poder leerlo.
    if (!draftKey || !draftRestored) return;
    try {
      if (cart.length === 0) {
        window.localStorage.removeItem(draftKey);
      } else {
        window.localStorage.setItem(draftKey, JSON.stringify({ cart, requiredDate, notes }));
      }
    } catch {
      // idem — persistir el borrador es una mejora, no algo que deba bloquear el flujo
    }
  }, [draftKey, draftRestored, cart, requiredDate, notes]);

  const area = useQuery({
    queryKey: ['my-area', establishmentId, roleCode],
    queryFn: () => getMyArea(establishmentId, roleCode!),
    enabled: !!establishmentId && !!roleCode,
  });

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => listCategories() });

  const products = useQuery({
    queryKey: search ? ['product-search', debouncedSearch] : ['products-by-category', selectedCategoryId],
    queryFn: () => (debouncedSearch ? searchProducts(debouncedSearch) : listProductsByCategory(selectedCategoryId!)),
    enabled: debouncedSearch.length > 1 || !!selectedCategoryId,
  });

  const cartCount = cart.length;
  const cartKeys = useMemo(() => new Set(cart.map((c) => c.key)), [cart]);

  function addProduct(p: { id: string; name: string; unit_id: string; units?: { code: string } | null }) {
    if (cartKeys.has(p.id)) return; // ya está — evita duplicados silenciosos
    setCart((c) => [...c, { key: p.id, product_id: p.id, name: p.name, unit_id: p.unit_id, unit_code: p.units?.code, quantity: 1, priority: 'normal' }]);
    toast(`${p.name} agregado al carrito`);
  }

  function addUnregistered(name: string, unitId: string, unitCode: string, quantity: number) {
    const key = `unregistered:${name}`;
    setCart((c) => [...c, { key, unregistered_product_name: name, name, unit_id: unitId, unit_code: unitCode, quantity }]);
    toast(`${name} agregado al carrito`);
  }

  function updateItem(key: string, patch: Partial<CartItem>) {
    setCart((c) => c.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function removeItem(key: string) {
    setCart((c) => c.filter((i) => i.key !== key));
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const result = await createRequisition({
        establishment_id: establishmentId,
        area_id: area.data!.id,
        required_date: requiredDate || undefined,
        notes: notes || undefined,
        items: cart.map((i) =>
          i.product_id
            ? { product_id: i.product_id, quantity: i.quantity, unit_id: i.unit_id, priority: i.priority }
            : { unregistered_product_name: i.unregistered_product_name!, quantity: i.quantity, unit_id: i.unit_id }
        ) as any,
      });
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast('Requerimiento enviado');
      setCart([]); setNotes(''); setRequiredDate(''); setCartOpen(false);
      queryClient.invalidateQueries({ queryKey: ['my-requisitions'] });
      window.location.href = '/requerimientos/mis-requerimientos';
    },
    onError: (e: Error) => toast(e.message || 'No pudimos enviar el requerimiento. Intenta nuevamente.', 'error'),
  });

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h1 className="font-display text-2xl font-semibold">Nuevo requerimiento</h1>
        <p className="text-sm text-muted-foreground">{area.data?.name ?? 'Tu área'}</p>
      </div>

      {/* Buscador global, siempre visible — no solo categoría → productos */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedCategoryId(null); }}
          placeholder="Buscar cualquier producto…"
          className="w-full h-11 rounded-md border border-input bg-card pl-10 pr-3 text-sm"
        />
      </div>

      {/* Categorías — ocultas mientras se busca, para no confundir dos formas de filtrar a la vez */}
      {!search && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {categories.isLoading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />)
            : categories.data?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategoryId(c.id)}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                    selectedCategoryId === c.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'
                  }`}
                >
                  {c.name}
                </button>
              ))}
        </div>
      )}

      {/* Grid de productos */}
      {!search && !selectedCategoryId ? (
        <p className="text-sm text-muted-foreground text-center py-10">Elige una categoría o usa el buscador de arriba.</p>
      ) : products.isLoading ? (
        <div className="grid grid-cols-2 gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : products.data && products.data.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {products.data.map((p: any) => (
            <ProductCard key={p.id} name={p.name} unitCode={p.units?.code} inCart={cartKeys.has(p.id)} onAdd={() => addProduct(p)} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-10">Sin resultados.</p>
      )}

      <button
        onClick={() => setUnregisteredOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:bg-accent"
      >
        <PackagePlus className="h-4 w-4" /> Producto no registrado
      </button>

      {/* Sticky bottom bar — contador + abrir carrito (sección 66) */}
      {cartCount > 0 && (
        <div className="fixed bottom-16 md:bottom-4 inset-x-0 md:inset-x-auto md:right-6 md:left-auto z-40 px-4 md:px-0">
          <Button size="lg" className="w-full md:w-auto shadow-card" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="h-4 w-4" />
            {cartCount} producto{cartCount === 1 ? '' : 's'} · Ver carrito
          </Button>
        </div>
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        onUpdateItem={updateItem}
        onRemoveItem={removeItem}
        requiredDate={requiredDate}
        onRequiredDateChange={setRequiredDate}
        notes={notes}
        onNotesChange={setNotes}
        onSubmit={() => submitMutation.mutate()}
        submitting={submitMutation.isPending}
      />

      <UnregisteredProductModal open={unregisteredOpen} onClose={() => setUnregisteredOpen(false)} onAdd={addUnregistered} />
    </div>
  );
}
