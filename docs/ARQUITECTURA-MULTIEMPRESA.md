# KRYPTA Business Suite · Arquitectura Multi-Empresa

Documentación de la transformación a plataforma SaaS. Está escrita para quien
tenga que mantener o extender el sistema dentro de un año.

---

## 1. Modelo de aislamiento

Cada empresa cliente es un *tenant*. Los datos conviven en una sola base y se
separan por la columna `empresa_id`.

**La defensa real está en PostgreSQL, no en el código.** Cada una de las 36 tablas
de negocio tiene activada seguridad a nivel de fila:

```sql
CREATE POLICY aislamiento_empresa ON clientes
  USING (
    NULLIF(current_setting('app.empresa_id', true), '') IS NULL
    OR empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::bigint
  );
```

La razón es la escala del sistema: hay unos 394 puntos de consulta. Confiar el
aislamiento a que ninguno olvide el filtro es una apuesta perdida, y el precio de
perderla es que una empresa vea la cartera de otra. Con esta política, una consulta
que omita el filtro sigue estando protegida.

Cuando no hay contexto —migraciones, comandos de consola, respaldos— la política
deja pasar. Es deliberado: sin esa excepción no se podría migrar ni respaldar.

### Dos requisitos de infraestructura

Sin ellos el aislamiento **no funciona**, aunque las políticas existan:

**El rol de conexión no puede ser superusuario ni tener `BYPASSRLS`.** Esos roles
ignoran las políticas siempre. Comprobado en pruebas: con superusuario, una empresa
veía y escribía datos de otra sin ningún impedimento. Verificar con:

```sql
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
```

El Centro de Monitoreo muestra una alerta roja si detecta este problema.

**Usar el endpoint directo de Neon, no el "-pooler".** El agrupador en modo
transacción reparte una conexión física entre peticiones, y el contexto de empresa
podría filtrarse de un cliente a otro.

### Capas complementarias

- `ContextoEmpresa` declara la empresa al inicio de cada petición y **verifica**
  que la base la haya recibido; si no coincide, la petición se detiene.
- El trait `PerteneceAEmpresa` añade filtro y sellado automáticos en Eloquent.
- `ContextoEmpresaMiddleware` bloquea empresas suspendidas o dadas de baja.

---

## 2. Autenticación y contexto

Cada usuario pertenece a una empresa (`usuarios.empresa_id`). El contexto sale del
token, sin subdominios ni selector.

**Excepción:** el Administrador Funcional Global tiene `empresa_id` nulo. No
pertenece a ninguna empresa y opera por encima del aislamiento.

---

## 3. Roles

| Rol | Alcance | Función |
|---|---|---|
| `ADMIN_GLOBAL` | Plataforma | Empresas, planes, módulos, monitoreo, soporte |
| `ADMIN_FUNCIONAL` | Una empresa | Configuración técnica. **No mueve dinero ni créditos** |
| `ADMINISTRADOR` | Una empresa | Responde por el negocio: aprueba, desembolsa, cierra caja |
| `SUPERVISOR` | Sus áreas | Supervisión territorial |
| `COBRADOR` | Sus áreas | Operación de campo |

La separación entre Administrador Funcional y Administrador es una **separación de
funciones**: el rol técnico suele ser el proveedor del software, y no debe poder
mover el dinero de su cliente. Está impuesta en el código, no solo en el menú:
`PermisoService::ACCIONES_TECNICAS` lista lo único que el funcional puede ejecutar.

El primer administrador global se crea desde el servidor:

```bash
php artisan krypta:admin-global --email=... --nombre="..."
```

---

## 4. Catálogo de módulos y habilitación

`catalogo_modulos` es el repositorio global de módulos del ecosistema. Cada empresa
tiene los suyos en `empresa_modulos`.

**Jerarquía:** lo contratado manda sobre el permiso individual. Un administrador que
se conceda un módulo que su empresa no tiene contratado **no entra**. Verificado en
pruebas.

Los módulos marcados como `nucleo` no se pueden apagar: sin ellos una empresa no
podría ni configurarse. El sistema valida dependencias antes de habilitar.

Para añadir un módulo nuevo al ecosistema basta con registrarlo en el catálogo; no
hay que tocar el núcleo.

---

## 5. Feature flags

`empresa_flags` permite activar funcionalidades concretas por empresa sin desplegar
código. La estructura está lista para consumirse desde el frontend y el backend.

---

## 6. Licencias y planes

`empresa_planes` guarda plan, estado, vigencia y límites.

**Criterio aplicado:** el límite de usuarios se valida **al crear**, no al entrar. Y
una licencia vencida **avisa pero no corta el servicio**: dejar sin sistema a una
empresa que está cobrando en la calle causaría más daño que el impago. El corte
efectivo es la suspensión, que es una decisión humana.

---

## 7. Numeración

`consecutivos` da a cada empresa sus propias series. Dos empresas pueden emitir su
`CR-000001` a la vez sin colisionar.

La reserva usa `FOR UPDATE`: si dos usuarios desembolsan en el mismo instante, uno
espera al otro y cada crédito recibe un número distinto.

---

## 8. Modo Soporte

El Administrador Global puede entrar temporalmente a una empresa. Exige un motivo
de al menos 10 caracteres y registra en `sesiones_soporte`: empresa, técnico,
motivo, dirección IP, duración y número de acciones. Cada registro de auditoría
generado durante la sesión queda marcado con `sesion_soporte_id`.

Mientras dura, una barra fija advierte en qué empresa se está operando. **Un acceso
técnico sin rastro es indistinguible de una intrusión**, y el historial está pensado
para poder mostrárselo al cliente que pregunte.

---

## 9. Identidad visual por empresa

Los parámetros de marca y los logos viven en tablas aisladas, así que **cada empresa
tiene su identidad automáticamente**.

- `/marca-publica` (sin sesión) → identidad de KRYPTA. En la pantalla de acceso
  todavía no se sabe quién entra.
- `/mi-marca` (con sesión) → identidad de la empresa, más su moneda, zona horaria
  y formato de fecha.

Al cerrar sesión se restablece la identidad de la plataforma.

---

## 10. Para desarrollos futuros

Un módulo nuevo hereda el aislamiento sin trabajo extra si respeta tres reglas:

1. **Toda tabla de negocio lleva `empresa_id`**, con su índice y su política. La
   lista de referencia está en la migración `002700`.
2. **Los modelos usan el trait `PerteneceAEmpresa`.** Filtra y sella solo.
3. **Nada de consultas globales.** Si un proceso necesita cruzar empresas (informes
   de plataforma), debe ser explícito y estar restringido al rol global.

Registrar el módulo en `catalogo_modulos` y en `PermisoService::MODULOS` es lo único
que hace falta para que aparezca en el menú, respete permisos y pueda habilitarse
por empresa.
