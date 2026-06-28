-- ============================================================================
-- SISTEMA DE MICROCRÉDITOS, VENTAS FINANCIADAS Y COBRANZA TERRITORIAL
-- Esquema PostgreSQL (fuente de verdad). Coincide con las migraciones Laravel.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- TIPOS ENUM
-- ---------------------------------------------------------------------------
CREATE TYPE rol_usuario        AS ENUM ('ADMINISTRADOR','SUPERVISOR','COBRADOR');
CREATE TYPE tipo_documento     AS ENUM ('CC','CE','TI','NIT','PASAPORTE');
CREATE TYPE genero             AS ENUM ('M','F','OTRO');
CREATE TYPE estado_civil       AS ENUM ('SOLTERO','CASADO','UNION_LIBRE','DIVORCIADO','VIUDO');
CREATE TYPE modalidad_pago     AS ENUM ('DIARIO','SEMANAL','QUINCENAL','MENSUAL');
CREATE TYPE tipo_interes       AS ENUM ('FIJO','SOBRE_SALDO');
CREATE TYPE estado_solicitud   AS ENUM (
  'BORRADOR','PENDIENTE_SUPERVISOR','PENDIENTE_ADMINISTRADOR',
  'APROBADO','RECHAZADO','DESEMBOLSADO','ACTIVO','FINALIZADO','CASTIGADO'
);
CREATE TYPE estado_cuota       AS ENUM ('PENDIENTE','PARCIAL','PAGADA','VENCIDA');
CREATE TYPE metodo_pago        AS ENUM ('EFECTIVO','TRANSFERENCIA','CONSIGNACION','NEQUI','DAVIPLATA');
CREATE TYPE estado_transfer    AS ENUM ('PENDIENTE_VALIDACION','APROBADO','RECHAZADO');
CREATE TYPE tipo_gestion_mora  AS ENUM ('LLAMADA','VISITA','ACUERDO_PAGO','OBSERVACION');
CREATE TYPE tipo_movimiento    AS ENUM ('INGRESO','EGRESO');
CREATE TYPE categoria_documento AS ENUM (
  'CEDULA_FRONTAL','CEDULA_POSTERIOR','CARTA_LABORAL','SOPORTE_INGRESOS','PAGARE','OTRO','COMPROBANTE_PAGO','SOPORTE_DESEMBOLSO'
);

-- ---------------------------------------------------------------------------
-- USUARIOS / ÁREAS / RBAC
-- ---------------------------------------------------------------------------
CREATE TABLE areas (
  id            BIGSERIAL PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL UNIQUE,
  descripcion   TEXT,
  activa        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id                    BIGSERIAL PRIMARY KEY,
  uuid                  UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  nombre                VARCHAR(150) NOT NULL,
  email                 VARCHAR(180) NOT NULL UNIQUE,
  password              VARCHAR(255) NOT NULL,
  rol                   rol_usuario NOT NULL,
  telefono              VARCHAR(30),
  activo                BOOLEAN NOT NULL DEFAULT TRUE,
  twofa_secret          VARCHAR(255),               -- cifrado a nivel app
  twofa_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  intentos_fallidos     SMALLINT NOT NULL DEFAULT 0,
  bloqueado_hasta       TIMESTAMPTZ,
  ultimo_login_at       TIMESTAMPTZ,
  ultimo_login_ip       INET,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Usuario ↔ Área (muchos a muchos)
CREATE TABLE usuario_area (
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  area_id     BIGINT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, area_id)
);

-- Refresh tokens (rotación)
CREATE TABLE refresh_tokens (
  id           BIGSERIAL PRIMARY KEY,
  usuario_id   BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash   VARCHAR(255) NOT NULL UNIQUE,
  revocado     BOOLEAN NOT NULL DEFAULT FALSE,
  expira_at    TIMESTAMPTZ NOT NULL,
  ip           INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_usuario ON refresh_tokens(usuario_id) WHERE revocado = FALSE;

-- ---------------------------------------------------------------------------
-- PARÁMETROS DEL SISTEMA Y LÍMITES DE APROBACIÓN (NUNCA HARDCODEADOS)
-- ---------------------------------------------------------------------------
CREATE TABLE parametros (
  id          BIGSERIAL PRIMARY KEY,
  clave       VARCHAR(120) NOT NULL UNIQUE,
  valor       JSONB NOT NULL,
  descripcion TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Límite de aprobación por rol (y opcionalmente por área/usuario)
CREATE TABLE limites_aprobacion (
  id            BIGSERIAL PRIMARY KEY,
  rol           rol_usuario NOT NULL,
  area_id       BIGINT REFERENCES areas(id) ON DELETE CASCADE,  -- NULL = global
  usuario_id    BIGINT REFERENCES usuarios(id) ON DELETE CASCADE,
  monto_maximo  NUMERIC(16,2) NOT NULL,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_limites_rol ON limites_aprobacion(rol) WHERE activo = TRUE;

-- ---------------------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------------------
CREATE TABLE clientes (
  id                    BIGSERIAL PRIMARY KEY,
  uuid                  UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  area_id               BIGINT NOT NULL REFERENCES areas(id),
  cobrador_id           BIGINT REFERENCES usuarios(id),
  -- personales
  nombres               VARCHAR(120) NOT NULL,
  apellidos             VARCHAR(120) NOT NULL,
  tipo_documento        tipo_documento NOT NULL,
  numero_documento      VARCHAR(40) NOT NULL,
  fecha_nacimiento      DATE,
  genero                genero,
  estado_civil          estado_civil,
  -- contacto
  telefono_principal    VARCHAR(30),
  telefono_secundario   VARCHAR(30),
  correo                VARCHAR(180),
  -- dirección
  direccion             VARCHAR(255),
  barrio                VARCHAR(120),
  ciudad                VARCHAR(120),
  referencia_ubicacion  TEXT,
  -- geolocalización
  latitud               NUMERIC(10,7),
  longitud              NUMERIC(10,7),
  -- laboral
  empresa               VARCHAR(150),
  cargo                 VARCHAR(120),
  antiguedad_meses      INT,
  salario               NUMERIC(14,2),
  direccion_laboral     VARCHAR(255),
  telefono_laboral      VARCHAR(30),
  activo                BOOLEAN NOT NULL DEFAULT TRUE,
  created_by            BIGINT REFERENCES usuarios(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo_documento, numero_documento)
);
CREATE INDEX idx_clientes_area ON clientes(area_id);
CREATE INDEX idx_clientes_cobrador ON clientes(cobrador_id);
CREATE INDEX idx_clientes_geo ON clientes(latitud, longitud);

CREATE TABLE referencias (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo        VARCHAR(20) NOT NULL CHECK (tipo IN ('FAMILIAR','PERSONAL')),
  nombre      VARCHAR(150) NOT NULL,
  telefono    VARCHAR(30),
  parentesco  VARCHAR(60),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documentos (metadatos; binarios en S3 privado)
CREATE TABLE documentos (
  id            BIGSERIAL PRIMARY KEY,
  cliente_id    BIGINT REFERENCES clientes(id) ON DELETE CASCADE,
  solicitud_id  BIGINT,                       -- FK añadida más abajo
  categoria     categoria_documento NOT NULL,
  s3_key        VARCHAR(512) NOT NULL,
  nombre_original VARCHAR(255),
  mime          VARCHAR(100),
  tamano_bytes  BIGINT,
  subido_por    BIGINT REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documentos_cliente ON documentos(cliente_id);

-- ---------------------------------------------------------------------------
-- PRODUCTOS Y VENTAS FINANCIADAS
-- ---------------------------------------------------------------------------
CREATE TABLE productos (
  id             BIGSERIAL PRIMARY KEY,
  nombre         VARCHAR(150) NOT NULL,
  descripcion    TEXT,
  precio_contado NUMERIC(14,2) NOT NULL,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- SOLICITUDES DE PRÉSTAMO / CRÉDITOS  (incluye reglas de seguro)
-- ---------------------------------------------------------------------------
CREATE TABLE solicitudes (
  id                       BIGSERIAL PRIMARY KEY,
  uuid                     UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  cliente_id               BIGINT NOT NULL REFERENCES clientes(id),
  area_id                  BIGINT NOT NULL REFERENCES areas(id),
  cobrador_id              BIGINT NOT NULL REFERENCES usuarios(id),
  producto_id              BIGINT REFERENCES productos(id),  -- si es venta financiada
  es_venta_financiada      BOOLEAN NOT NULL DEFAULT FALSE,

  -- montos e interés
  capital_solicitado       NUMERIC(16,2) NOT NULL,
  monto_aprobado           NUMERIC(16,2),
  tasa_interes             NUMERIC(7,4) NOT NULL,           -- ej 0.1000 = 10%
  tipo_interes             tipo_interes NOT NULL DEFAULT 'FIJO',
  interes                  NUMERIC(16,2),                   -- valor intereses calculado

  -- modalidad y cronograma
  modalidad                modalidad_pago NOT NULL,
  numero_cuotas            INT NOT NULL CHECK (numero_cuotas > 0),
  fecha_primer_pago        DATE,
  valor_cuota              NUMERIC(16,2),
  total_financiado         NUMERIC(16,2),

  -- SEGURO (configurable manualmente, rango 5%–10%)
  porcentaje_seguro        NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (porcentaje_seguro >= 0 AND porcentaje_seguro <= 0.10),
  valor_seguro             NUMERIC(16,2) NOT NULL DEFAULT 0,
  monto_desembolsado       NUMERIC(16,2),                   -- neto = aprobado - seguro
  total_recaudar           NUMERIC(16,2),                   -- aprobado + intereses
  seguro_exonerado         BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_exoneracion       TEXT,
  exoneracion_solicitada_por BIGINT REFERENCES usuarios(id),
  exoneracion_aprobada_por   BIGINT REFERENCES usuarios(id),

  -- aprobación / estado
  estado                   estado_solicitud NOT NULL DEFAULT 'BORRADOR',
  usuario_aprobador        BIGINT REFERENCES usuarios(id),
  fecha_aprobacion         TIMESTAMPTZ,
  motivo_rechazo           TEXT,

  fecha_solicitud          DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by               BIGINT REFERENCES usuarios(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Coherencia de seguro: si exonerado => valor_seguro = 0
  CONSTRAINT chk_seguro_exonerado CHECK (
    (seguro_exonerado = TRUE  AND valor_seguro = 0) OR
    (seguro_exonerado = FALSE)
  ),
  -- Rango de seguro permitido cuando no exonerado y porcentaje > 0
  CONSTRAINT chk_rango_seguro CHECK (
    porcentaje_seguro = 0 OR (porcentaje_seguro >= 0.05 AND porcentaje_seguro <= 0.10)
  )
);
CREATE INDEX idx_solicitudes_estado ON solicitudes(estado);
CREATE INDEX idx_solicitudes_cliente ON solicitudes(cliente_id);
CREATE INDEX idx_solicitudes_area ON solicitudes(area_id);

ALTER TABLE documentos
  ADD CONSTRAINT fk_documentos_solicitud
  FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE;

-- Desembolsos
CREATE TABLE desembolsos (
  id            BIGSERIAL PRIMARY KEY,
  solicitud_id  BIGINT NOT NULL REFERENCES solicitudes(id),
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  valor         NUMERIC(16,2) NOT NULL,
  metodo        metodo_pago NOT NULL,
  soporte_s3_key VARCHAR(512),
  registrado_por BIGINT REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- CRONOGRAMA DE CUOTAS
-- ---------------------------------------------------------------------------
CREATE TABLE cuotas (
  id                BIGSERIAL PRIMARY KEY,
  solicitud_id      BIGINT NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  numero_cuota      INT NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  valor             NUMERIC(16,2) NOT NULL,
  valor_pagado      NUMERIC(16,2) NOT NULL DEFAULT 0,
  saldo             NUMERIC(16,2) NOT NULL,
  estado            estado_cuota NOT NULL DEFAULT 'PENDIENTE',
  dias_mora         INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (solicitud_id, numero_cuota)
);
CREATE INDEX idx_cuotas_solicitud ON cuotas(solicitud_id);
CREATE INDEX idx_cuotas_vencimiento ON cuotas(fecha_vencimiento) WHERE estado IN ('PENDIENTE','PARCIAL','VENCIDA');

-- ---------------------------------------------------------------------------
-- PAGOS Y TRANSFERENCIAS
-- ---------------------------------------------------------------------------
CREATE TABLE pagos (
  id            BIGSERIAL PRIMARY KEY,
  uuid          UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  cliente_id    BIGINT NOT NULL REFERENCES clientes(id),
  solicitud_id  BIGINT NOT NULL REFERENCES solicitudes(id),
  cuota_id      BIGINT REFERENCES cuotas(id),
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  valor         NUMERIC(16,2) NOT NULL CHECK (valor > 0),
  metodo        metodo_pago NOT NULL,
  registrado_por BIGINT REFERENCES usuarios(id),
  -- offline sync
  client_uuid   UUID UNIQUE,            -- idempotencia desde PWA offline
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pagos_solicitud ON pagos(solicitud_id);

CREATE TABLE transferencias (
  id             BIGSERIAL PRIMARY KEY,
  pago_id        BIGINT REFERENCES pagos(id),
  cliente_id     BIGINT NOT NULL REFERENCES clientes(id),
  banco          VARCHAR(120) NOT NULL,
  referencia     VARCHAR(120) NOT NULL,
  valor          NUMERIC(16,2) NOT NULL,
  estado         estado_transfer NOT NULL DEFAULT 'PENDIENTE_VALIDACION',
  validado_por   BIGINT REFERENCES usuarios(id),
  validado_at    TIMESTAMPTZ,
  motivo_rechazo TEXT,
  registrado_por BIGINT REFERENCES usuarios(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transferencia_comprobantes (
  id               BIGSERIAL PRIMARY KEY,
  transferencia_id BIGINT NOT NULL REFERENCES transferencias(id) ON DELETE CASCADE,
  s3_key           VARCHAR(512) NOT NULL,
  mime             VARCHAR(100),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- GESTIÓN DE MORA
-- ---------------------------------------------------------------------------
CREATE TABLE gestiones_mora (
  id            BIGSERIAL PRIMARY KEY,
  cliente_id    BIGINT NOT NULL REFERENCES clientes(id),
  solicitud_id  BIGINT REFERENCES solicitudes(id),
  tipo          tipo_gestion_mora NOT NULL,
  observacion   TEXT,
  fecha_acuerdo DATE,
  monto_acuerdo NUMERIC(16,2),
  latitud       NUMERIC(10,7),
  longitud      NUMERIC(10,7),
  registrado_por BIGINT REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE visitas (
  id            BIGSERIAL PRIMARY KEY,
  cliente_id    BIGINT NOT NULL REFERENCES clientes(id),
  observacion   TEXT,
  latitud       NUMERIC(10,7),
  longitud      NUMERIC(10,7),
  registrado_por BIGINT REFERENCES usuarios(id),
  client_uuid   UUID UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- CAJA
-- ---------------------------------------------------------------------------
CREATE TABLE movimientos_caja (
  id            BIGSERIAL PRIMARY KEY,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo          tipo_movimiento NOT NULL,
  concepto      VARCHAR(150) NOT NULL,
  valor         NUMERIC(16,2) NOT NULL,
  referencia_tipo VARCHAR(40),   -- PAGO, DESEMBOLSO, GASTO, VENTA
  referencia_id BIGINT,
  area_id       BIGINT REFERENCES areas(id),
  registrado_por BIGINT REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_caja_fecha ON movimientos_caja(fecha);

CREATE TABLE cierres_caja (
  id             BIGSERIAL PRIMARY KEY,
  fecha          DATE NOT NULL,
  area_id        BIGINT REFERENCES areas(id),
  total_ingresos NUMERIC(16,2) NOT NULL,
  total_egresos  NUMERIC(16,2) NOT NULL,
  saldo          NUMERIC(16,2) NOT NULL,
  cerrado_por    BIGINT REFERENCES usuarios(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fecha, area_id)
);

-- ---------------------------------------------------------------------------
-- AUDITORÍA (inmutable: sin UPDATE ni DELETE)
-- ---------------------------------------------------------------------------
CREATE TABLE auditoria (
  id            BIGSERIAL PRIMARY KEY,
  usuario_id    BIGINT REFERENCES usuarios(id),
  accion        VARCHAR(60) NOT NULL,           -- CREATE/UPDATE/DELETE/APPROVE/REJECT/EXONERATE/LOGIN
  entidad       VARCHAR(80) NOT NULL,
  entidad_id    BIGINT,
  datos_anteriores JSONB,
  datos_nuevos  JSONB,
  ip            INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auditoria_entidad ON auditoria(entidad, entidad_id);
CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);

-- Impedir modificación/eliminación de auditoría
CREATE OR REPLACE FUNCTION bloquear_modificacion_auditoria()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría es inmutable: operación % no permitida', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auditoria_no_update
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_auditoria();

-- ---------------------------------------------------------------------------
-- SEED MÍNIMO DE PARÁMETROS Y LÍMITES
-- ---------------------------------------------------------------------------
INSERT INTO parametros (clave, valor, descripcion) VALUES
  ('seguro.porcentaje_min', '0.05', 'Porcentaje mínimo de seguro permitido'),
  ('seguro.porcentaje_max', '0.10', 'Porcentaje máximo de seguro permitido'),
  ('mora.dias_castigo', '120', 'Días de mora para castigar cartera'),
  ('auth.max_intentos', '5', 'Intentos fallidos antes de bloqueo'),
  ('auth.bloqueo_minutos', '15', 'Minutos de bloqueo tras superar intentos');

INSERT INTO limites_aprobacion (rol, monto_maximo) VALUES
  ('SUPERVISOR', 3000000.00),
  ('ADMINISTRADOR', 999999999.00);
