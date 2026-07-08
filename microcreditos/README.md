# Sistema de Microcréditos, Ventas Financiadas y Cobranza Territorial

Monorepo: **Laravel 12 (API)** · **React 19 + TS (PWA)** · **PostgreSQL** · **Redis** · **AWS ECS Fargate**.

## Estructura
```
microcreditos/
├── docs/ARQUITECTURA.md      # Arquitectura general, FE, BE y AWS + máquina de estados
├── database/schema.sql       # Esquema PostgreSQL completo (fuente de verdad)
├── backend/                  # Laravel 12: modelos, servicios, controladores, policies, jobs, tests
├── frontend/                 # React 19 + Vite + Zustand + React Query + Zod + PWA
├── infra/                    # Dockerfiles, Terraform AWS, nginx
├── .github/workflows/        # CI/CD GitHub Actions
└── docker-compose.yml        # Entorno local completo
```

## Arranque local
```bash
cp backend/.env.example backend/.env
docker compose up --build
# API:  http://localhost:8000/api/health
# Web:  http://localhost:3000
```

Migraciones / seed (dentro del contenedor api):
```bash
docker compose exec api php artisan jwt:secret
docker compose exec api php artisan migrate --seed
```

Usuarios demo: admin@empresa.com / supervisor@empresa.com / cobrador@empresa.com (claves en el seeder).

## Reglas de negocio críticas implementadas
- **Seguro**: `valor_seguro = monto_aprobado × %`; `desembolsado = aprobado − seguro`; **intereses siempre sobre el monto aprobado**.
- **Exoneración**: si `seguro_exonerado = TRUE` → seguro 0, cliente recibe 100%, y la solicitud pasa **obligatoriamente** a `PENDIENTE_ADMINISTRADOR`. Ningún supervisor puede aprobarla (prioridad absoluta sobre el límite monetario).
- **Límites de aprobación**: configurados en BD (`limites_aprobacion`), nunca hardcodeados.
- **Auditoría inmutable**: trigger PostgreSQL bloquea UPDATE/DELETE sobre `auditoria`.
- **Seguridad**: JWT + refresh rotativo, bloqueo por intentos, 2FA, RBAC por Policy, CSP, rate limiting.
