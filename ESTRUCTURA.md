# Estructura de carpetas — Gescomp

```
gescomp/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/
│   │   ├── (app)/
│   │   │   ├── layout.tsx              ← valida sesión + rol, inyecta selector de establecimiento
│   │   │   ├── home/
│   │   │   ├── requerimientos/
│   │   │   │   ├── nuevo/
│   │   │   │   └── mis-requerimientos/
│   │   │   ├── compras/
│   │   │   │   ├── bandeja/
│   │   │   │   ├── consolidados/
│   │   │   │   ├── pedidos-proveedor/
│   │   │   │   └── ordenes/[id]/
│   │   │   ├── recepcion/
│   │   │   ├── facturas/
│   │   │   ├── conciliacion/
│   │   │   ├── productos/
│   │   │   ├── proveedores/
│   │   │   ├── dashboard/
│   │   │   ├── reportes/
│   │   │   ├── alertas/
│   │   │   └── admin/
│   │   │       ├── usuarios/
│   │   │       └── auditoria/
│   │   └── api/                        ← solo para webhooks/PDF si Server Actions no alcanza
│   ├── components/
│   │   ├── ui/                         ← componentes base reutilizables
│   │   └── forms/
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts               ← cliente browser
│   │   │   └── server.ts               ← cliente server (RLS con sesión)
│   │   ├── actions/                    ← Server Actions por dominio (requisitions.ts, orders.ts...)
│   │   └── validators/                 ← esquemas Zod, uno por entidad
│   └── types/
│       └── database.ts                 ← tipos generados desde Supabase (supabase gen types)
├── supabase/
│   └── migrations/
│       └── 0001_init_schema.sql
├── .env.local.example
├── package.json
└── README.md
```

**Regla de organización:** una carpeta por módulo funcional dentro de `(app)/`, no por tipo de componente — así cada fase del roadmap (Fase 8 en adelante) corresponde a una carpeta concreta y se puede desarrollar/probar de forma aislada.
