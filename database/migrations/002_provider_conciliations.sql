-- SIGBA — Migración: Conciliaciones Proveedor (Fase 2)
-- Fecha: 2026-05-21
-- Descripción: Tabla independiente para trazabilidad de conciliaciones con proveedor externo.
--   NO modifica redenciones, bonos_diarios, ni ninguna tabla operacional existente.

CREATE TABLE IF NOT EXISTS conciliaciones_proveedor (
  id                  SERIAL PRIMARY KEY,
  fecha               DATE NOT NULL,
  tipo                VARCHAR(20) NOT NULL CHECK (tipo IN ('almuerzo', 'refrigerio')),
  cantidad_sigba      INTEGER NOT NULL,
  cantidad_proveedor  INTEGER NOT NULL,
  diferencia          INTEGER NOT NULL,
  estado              VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('CONCILIADO', 'DIFERENCIA_MENOR', 'DIFERENCIA_CRITICA', 'PENDIENTE')),
  observaciones       TEXT,
  admin_id            INTEGER REFERENCES admins(id),
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_fecha
  ON conciliaciones_proveedor (fecha);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_tipo
  ON conciliaciones_proveedor (tipo);

CREATE UNIQUE INDEX IF NOT EXISTS unique_conciliacion_dia_tipo
  ON conciliaciones_proveedor (fecha, tipo);
