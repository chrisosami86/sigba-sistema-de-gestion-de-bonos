-- ============================================================
-- SIGBA — Migracion 005: modalidad_operacional
-- Fase preparatoria. NO cambia logica operacional.
--
-- Agrega columna explicita de clasificacion de consumo en
-- redenciones para uso futuro. La inferencia por horario
-- (modalidad.helper.js) sigue funcionando exactamente igual.
--
-- Ejecutar UNA sola vez:
--   psql -U postgres -d sigba_db -f 005_add_modalidad_operacional.sql
-- ============================================================

BEGIN;

-- 1. Agregar columna (nullable inicialmente, sin impacto operacional)
ALTER TABLE redenciones
ADD COLUMN IF NOT EXISTS modalidad_operacional VARCHAR(30);

-- 2. Backfill seguro para registros historicos
--    Usa exactamente la misma logica de clasificacion que el sistema
--    actual (modalidad.helper.js / getModalidadExpression).
--    Si un caso no puede inferirse con seguridad, se deja NULL.
UPDATE redenciones r SET modalidad_operacional = subquery.modalidad
FROM (
  SELECT
    r2.id,
    CASE
      WHEN r2.tipo_asignacion = 'ADMINISTRATIVA'
        THEN 'administrativo'
      WHEN cb.tipo = 'almuerzo'
        AND r2.hora_solicitud::time BETWEEN TIME '08:00' AND TIME '10:15'
        THEN 'subsidiado'
      WHEN cb.tipo = 'almuerzo'
        AND r2.hora_solicitud::time BETWEEN TIME '11:30' AND TIME '12:05'
        THEN 'venta_libre'
      WHEN cb.tipo = 'refrigerio'
        AND r2.hora_solicitud::time BETWEEN TIME '17:00' AND TIME '18:29'
        THEN 'subsidiado'
      WHEN cb.tipo = 'refrigerio'
        AND r2.hora_solicitud::time BETWEEN TIME '18:30' AND TIME '22:00'
        THEN 'venta_libre'
      ELSE NULL
    END AS modalidad
  FROM redenciones r2
  JOIN bonos_diarios bd ON bd.id = r2.bono_diario_id
  JOIN config_bonos cb ON cb.id = bd.config_bono_id
  WHERE r2.modalidad_operacional IS NULL
) subquery
WHERE r.id = subquery.id;

COMMIT;
