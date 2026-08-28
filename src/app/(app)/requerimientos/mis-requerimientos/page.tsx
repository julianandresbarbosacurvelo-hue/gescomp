'use client';

import { useSession } from '@/lib/session-context';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { RequesterDashboard } from '@/components/business/dashboards/RequesterDashboard';

// Reutiliza el mismo componente que ya se usa dentro del Dashboard para roles de
// área — el contenido es exactamente el mismo (CTA + estado de los requerimientos
// propios), así que no tenía sentido duplicar la lógica en un componente nuevo.
export default function MisRequerimientosPage() {
  const session = useSession();
  const { activeEstablishmentId } = useEstablishmentStore();
  const establishmentId = activeEstablishmentId ?? session.roles[0]?.establishmentId;

  if (!establishmentId) return null;

  return <RequesterDashboard establishmentId={establishmentId} />;
}
