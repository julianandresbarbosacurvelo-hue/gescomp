import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Zustand se limita ESTRICTAMENTE a esto: el establecimiento activo. Cualquier dato
// remoto (productos, órdenes, etc.) es server state y vive en React Query o en Server
// Components — nunca aquí (regla explícita del brief de frontend, sección 5).
type EstablishmentState = {
  activeEstablishmentId: string | null;
  setActiveEstablishment: (id: string) => void;
};

export const useEstablishmentStore = create<EstablishmentState>()(
  persist(
    (set) => ({
      activeEstablishmentId: null,
      setActiveEstablishment: (id) => set({ activeEstablishmentId: id }),
    }),
    { name: 'gescomp-active-establishment' }
  )
);
