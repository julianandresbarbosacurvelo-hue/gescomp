import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { AppShell } from '@/components/business/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();

  // La protección real de datos ya la hace RLS en cada tabla — esto es solo para
  // no mostrarle una pantalla vacía a alguien sin sesión; nunca es el mecanismo de seguridad.
  if (!session) redirect('/login');

  return <AppShell session={session}>{children}</AppShell>;
}
