/**
 * SIGBA — Helper SQL de zona horaria institucional
 *
 * Centraliza las expresiones SQL de fecha/hora bajo America/Bogota.
 * Reemplaza CURRENT_DATE y NOW() en queries operacionales para
 * garantizar consistencia explícita independientemente de la
 * configuracion de timezone de sesion de PostgreSQL.
 *
 * Uso:
 *   const { BOGOTA } = require('./sql-timezone.helper');
 *   const query = `... WHERE fecha = ${BOGOTA.date} ...`;
 *
 * IMPORTANTE:
 *   - Usar SOLO en logica operacional (fechas de negocio, validaciones)
 *   - NO usar para auditoria (updated_at, created_at, last_login)
 *   - Las comillas ya estan incluidas en las constantes
 */

const BOGOTA = {
  date: `(NOW() AT TIME ZONE 'America/Bogota')::date`,
  timestamp: `(NOW() AT TIME ZONE 'America/Bogota')`,
};

module.exports = { BOGOTA };
