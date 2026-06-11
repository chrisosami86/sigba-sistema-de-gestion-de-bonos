-- ============================================================
-- SIGBA - Remover restriccion legacy unique_student_bono_diario
-- ============================================================
--
-- Produccion puede conservar la restriccion unica historica:
--   unique_student_bono_diario UNIQUE(student_id, bono_diario_id)
--
-- Esa restriccion impide conservar el historial legitimo:
--   OPERATIVA -> EXPIRADO
--   ADMINISTRATIVA -> RECLAMADO
--
-- Migracion idempotente: no modifica datos, no recrea restricciones
-- y no toca tablas adicionales.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_student_bono_diario'
      AND conrelid = 'redenciones'::regclass
  ) THEN
    ALTER TABLE redenciones DROP CONSTRAINT unique_student_bono_diario;
  END IF;
END $$;

DROP INDEX IF EXISTS unique_student_bono_diario;
