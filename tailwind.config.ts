import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'], // preparado, pero el producto se mantiene en modo claro por ahora
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem', screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        // Colores de estado — mapeados 1:1 contra los estados reales del backend (ver src/lib/status.ts)
        status: {
          gris: '#6B7280',
          azul: '#2563EB',
          violeta: '#7C3AED',
          naranja: '#EA580C',
          verde: '#16A34A',
          rojo: '#DC2626',
          'verde-oscuro': '#166534',
        },
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'serif'],
        sans: ['var(--font-plex-sans)', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // Deliberadamente sutil — "hospitality premium", nada de sombras marcadas.
        card: '0 1px 2px 0 rgb(31 36 33 / 0.04)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
