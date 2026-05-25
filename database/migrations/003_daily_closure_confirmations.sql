-- SIGBA — Migración: Confirmaciones de Cierre Diario (Fase 4B)
-- Fecha: 2026-05-25
-- Descripción: Tabla para trazabilidad institucional de confirmación de cierre diario.
--   NO modifica redenciones, bonos_diarios, ni conciliaciones_proveedor.

CREATE TABLE IF NOT EXISTS daily_closure_confirmations (
  id                SERIAL PRIMARY KEY,
  fecha_operacion   DATE NOT NULL,
  confirmado_por    INTEGER REFERENCES admins(id),
  confirmado_at     TIMESTAMP,
  estado            VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_CONFIRMACION'
                    CHECK (estado IN ('PENDIENTE_CONFIRMACION', 'CONFIRMADO')),
  observaciones     TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_closure_confirmation_fecha
  ON daily_closure_confirmations (fecha_operacion);

CREATE INDEX IF NOT EXISTS idx_closure_confirmation_estado
  ON daily_closure_confirmations (estado);
