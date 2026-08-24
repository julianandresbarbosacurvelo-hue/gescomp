'use client';

import { useSession } from '@/lib/session-context';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { getActiveRoleCodes } from '@/lib/session-utils';
import { ManagerDashboard } from '@/components/business/dashboards/ManagerDashboard';
import { BuyerDashboard } from '@/components/business/dashboards/BuyerDashboard';
import { RequesterDashboard } from '@/components/business/dashboards/RequesterDashboard';

// NO se muestra el mismo dashboard a todos los roles (sección 10 del brief).
// Un usuario con más de un rol en el mismo establecimiento ve el de mayor alcance:
// admin > coordinador_compras > rol de área. No hay un rol "receptor" dedicado
// (confirmado antes: cualquiera con rol activo puede recibir), así que la vista de
// recepción vive como sección dentro del dashboard de compras y como pantalla propia
// en /recepcion — no como una cuarta variante de dashboard.
export default function DashboardPage() {
  const session = useSession();
  const { activeEstablishmentId } = useEstablishmentStore();

  const establishmentId = activeEstablishmentId ?? session.roles[0]?.establishmentId;
  if (!establishmentId) return null;

  const roles = getActiveRoleCodes(session.roles, establishmentId);

  if (roles.includes('admin')) return <ManagerDashboard establishmentId={establishmentId} />;
  if (roles.includes('coordinador_compras')) return <BuyerDashboard establishmentId={establishmentId} />;
  return <RequesterDashboard establishmentId={establishmentId} />;
}
