import { signIn } from '@/lib/actions/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-semibold text-center mb-1">Gescomp</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Ingresa con tu cuenta para continuar
        </p>

        <form action={signIn} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">Correo</label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">Contraseña</label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>

          {searchParams.error && (
            <p className="text-sm text-destructive" role="alert">
              No pudimos iniciar sesión. Verifica tu correo y contraseña e intenta nuevamente.
            </p>
          )}

          <Button type="submit" size="lg" className="w-full">Ingresar</Button>
        </form>
      </div>
    </div>
  );
}
