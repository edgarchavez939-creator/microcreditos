# Arquitectura — Sistema de Microcréditos, Ventas Financiadas y Cobranza Territorial

## 1. Arquitectura general (alto nivel)

```
                          ┌─────────────────────────────────────┐
                          │            Usuarios                  │
                          │  PWA instalable · Chrome/Edge/Safari │
                          │  Android · iPhone · Tablet · iPad    │
                          └───────────────┬─────────────────────┘
                                          │ HTTPS
                                          ▼
                          ┌─────────────────────────────────────┐
                          │  CloudFront (CDN + TLS + WAF)        │
                          │  - Estáticos SPA (React build)       │
                          │  - Cache de assets · CSP headers     │
                          └───────────────┬─────────────────────┘
                                          │
                  ┌───────────────────────┴────────────────────────┐
                  │ /api/*                                          │ /  (SPA)
                  ▼                                                 ▼
       ┌────────────────────────┐                       ┌──────────────────────┐
       │ Application Load        │                       │  S3 (SPA estática)   │
       │ Balancer (HTTPS:443)    │                       │  + OAC privado       │
       └───────────┬─────────────┘                       └──────────────────────┘
                   │
                   ▼
       ┌──────────────────────────────────────┐
       │  ECS Fargate — servicio "api"        │
       │  Laravel 12 (PHP-FPM + Nginx)        │
       │  Auto Scaling por CPU/RPS            │
       └───┬───────────────┬──────────────┬───┘
           │               │              │
           ▼               ▼              ▼
   ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐
   │ RDS         │  │ ElastiCache │  │ ECS Fargate          │
   │ PostgreSQL  │  │ Redis       │  │ servicio "worker"    │
   │ Multi-AZ    │  │ (cache,     │  │ Laravel queue:work   │
   │             │  │  sesiones,  │  │ (Jobs/Events)        │
   │             │  │  colas)     │  └──────────────────────┘
   └─────────────┘  └─────────────┘
           │
           ▼
   ┌─────────────────────────┐         ┌──────────────────────┐
   │ S3 privado (documentos) │         │ CloudWatch           │
   │ cédulas, soportes,      │         │ logs + métricas +    │
   │ comprobantes, pagarés   │         │ alarmas + dashboards │
   └─────────────────────────┘         └──────────────────────┘
                                                  │
                                       ┌──────────────────────┐
                                       │ Google Maps API      │
                                       │ (mapa territorial)   │
                                       └──────────────────────┘
```

### Principios
- **Mobile First / PWA**: la app se instala y opera offline (IndexedDB + Service Worker) sincronizando al recuperar red.
- **Separación de responsabilidades**: SPA estática servida desde S3/CloudFront; API stateless en Fargate; trabajo asíncrono en `worker`.
- **Stateless API**: sin sesión en memoria del contenedor; estado en RDS/Redis. Escala horizontal sin afinidad.
- **Seguridad por capas**: WAF → ALB → SG → IAM → JWT/RBAC → Policies → cifrado en reposo (KMS) y tránsito (TLS).
- **Todo configurable en BD**: límites de aprobación, tasas, parámetros de seguro; nada hardcodeado.

## 2. Arquitectura Frontend

```
React 19 + TypeScript + Vite
│
├── Estado servidor        → React Query (cache, reintentos, invalidación)
├── Estado cliente global  → Zustand (auth, UI, cola offline)
├── Formularios            → React Hook Form + Zod (validación tipada)
├── Estilos                → Tailwind CSS (mobile-first)
├── PWA                    → vite-plugin-pwa (Workbox) + IndexedDB (idb)
├── Mapas                  → @react-google-maps/api
└── HTTP                   → Axios (interceptor refresh-token + cola offline)
```

Capas: `pages` (rutas) → `features` (lógica de dominio) → `components` (UI) → `lib/api` (cliente) → `stores` (Zustand) → `hooks` (React Query).

## 3. Arquitectura Backend (Laravel 12)

Arquitectura en capas + patrón Service/Repository:

```
HTTP Request
   │
   ▼
Middleware  (auth:api JWT, throttle, 2FA gate, audit context, CSP)
   │
   ▼
FormRequest (validación) ──► DTO
   │
   ▼
Controller  (orquesta, no contiene reglas de negocio)
   │
   ▼
Policy      (autorización RBAC por recurso)
   │
   ▼
Service     (reglas de negocio: seguro, máquina de estados, mora)
   │
   ├──► Repository (acceso a datos, Eloquent)
   ├──► Event/Listener (auditoría, notificaciones)
   └──► Job/Queue (mora, cronogramas, push, sync S3)
   │
   ▼
JsonResource (serialización de respuesta)
```

## 4. Arquitectura AWS (productiva)

| Capa | Servicio | Configuración |
|------|----------|---------------|
| CDN/TLS | CloudFront + ACM + WAFv2 | OAC a S3, CSP, rate limiting borde |
| Estáticos | S3 (spa-bucket) | privado, solo vía OAC |
| Balanceo | ALB | HTTPS 443, target group ECS, health `/api/health` |
| Cómputo API | ECS Fargate (api) | 2+ tareas, autoscaling CPU>60% |
| Cómputo Worker | ECS Fargate (worker) | `queue:work`, scheduler |
| Datos | RDS PostgreSQL Multi-AZ | cifrado KMS, backups 7d, PITR |
| Cache/Colas | ElastiCache Redis | cluster, cifrado en tránsito |
| Documentos | S3 (docs-bucket) | privado, presigned URLs, cifrado SSE-KMS |
| Secretos | Secrets Manager | credenciales DB, JWT secret, API keys |
| Observabilidad | CloudWatch | logs, métricas, alarmas, X-Ray opcional |
| Red | VPC 2 AZ | subnets públicas (ALB) + privadas (ECS/RDS/Redis) |
| CI/CD | GitHub Actions + ECR | build, test, push, deploy ECS |

## 5. Máquina de estados de la solicitud (regla de negocio central)

```
            crear
BORRADOR ──────────► PENDIENTE_SUPERVISOR ──aprueba(≤límite)──► APROBADO ──► DESEMBOLSADO ──► ACTIVO ──► FINALIZADO
   │                      │                                        ▲                                      │
   │ seguro_exonerado     │ supera límite                          │                                      │ impago prolongado
   │   = TRUE             ▼                                         │                                      ▼
   └──────────► PENDIENTE_ADMINISTRADOR ─────aprueba(admin)─────────┘                                  CASTIGADO
                      │
                      └── rechaza ──► RECHAZADO
```

**Regla de prioridad absoluta:** si `seguro_exonerado = TRUE`, la solicitud salta a `PENDIENTE_ADMINISTRADOR` sin importar el monto; ningún supervisor puede aprobarla. Solo un administrador autoriza.
