// SIGBA — Validación de franja para asignaciones administrativas
require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';

const pool = require('../../backend/src/config/db');
const { getModalidadExpression } = require('../../backend/src/shared/helpers/modalidad.helper');

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  VALIDACIÓN DE FRANJA ADMINISTRATIVA');
  console.log('═══════════════════════════════════════════════\n');

  const modalidadExpr = getModalidadExpression();
  console.log('─── Expresión CASE generada ───');
  console.log(modalidadExpr);

  // ──── Verificar redenciones existentes ────
  console.log('\n─── Verificación de redenciones en DB ───');
  const allReds = await pool.query(`
    SELECT r.id, r.estado, r.tipo_asignacion, r.hora_solicitud::time AS hora,
           cb.tipo, bd.fecha
    FROM redenciones r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    ORDER BY r.id
  `);

  if (allReds.rows.length === 0) {
    console.log('  (No hay redenciones en la DB)');
  }

  for (const row of allReds.rows) {
    const modalidad = await pool.query(`
      SELECT (${modalidadExpr}) AS modalidad
      FROM redenciones r
      JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
      JOIN config_bonos cb ON cb.id = bd.config_bono_id
      WHERE r.id = $1
    `, [row.id]);

    const franja = modalidad.rows[0].modalidad;
    const icon = franja === 'desconocida' ? '⚠️' : '✅';
    console.log(`  ${icon} id=${row.id} tipo=${row.tipo} estado=${row.estado} asig=${row.tipo_asignacion} hora_sol=${row.hora} → franja="${franja}"`);
  }

  // ──── Simular: admin asigna almuerzo a las 3PM ────
  console.log('\n─── Simulación: admin asigna almuerzo a las 15:00 ───');
  const simResult = await pool.query(`
    SELECT (${modalidadExpr}) AS modalidad
    FROM (
      SELECT
        1 AS id, 999 AS student_id, 3 AS bono_diario_id,
        'reclamado' AS estado,
        '2026-05-21 15:00:00'::timestamp AS hora_solicitud,
        '2026-05-21 15:00:00'::timestamp AS hora_reclamo,
        NULL::timestamp AS expiracion_at,
        'ADMINISTRATIVA' AS tipo_asignacion
    ) r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
  `);
  console.log(`  Franja resultante: "${simResult.rows[0].modalidad}"`);
  console.log(`  ${simResult.rows[0].modalidad === 'venta_libre' ? '✅ CORRECTO: muestra venta_libre en vez de desconocida' : '⚠️ INCORRECTO'}`);

  // ──── Simular: admin asigna refrigerio a las 9AM ────
  console.log('\n─── Simulación: admin asigna refrigerio a las 09:00 ───');
  const sim2 = await pool.query(`
    SELECT (${modalidadExpr}) AS modalidad
    FROM (
      SELECT
        2 AS id, 999 AS student_id, 4 AS bono_diario_id,
        'reclamado' AS estado,
        '2026-05-21 09:00:00'::timestamp AS hora_solicitud,
        '2026-05-21 09:00:00'::timestamp AS hora_reclamo,
        NULL::timestamp AS expiracion_at,
        'ADMINISTRATIVA' AS tipo_asignacion
    ) r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
  `);
  console.log(`  Franja resultante: "${sim2.rows[0].modalidad}"`);
  console.log(`  ${sim2.rows[0].modalidad === 'venta_libre' ? '✅ CORRECTO' : '⚠️ INCORRECTO'}`);

  // ──── Simular: flujo normal subsidiado (08:05 almuerzo) ────
  console.log('\n─── Simulación: flujo normal subsidio almuerzo 08:05 ───');
  const sim3 = await pool.query(`
    SELECT (${modalidadExpr}) AS modalidad
    FROM (
      SELECT 3 AS id, 1 AS student_id, 3 AS bono_diario_id,
        'reservado' AS estado,
        '2026-05-21 08:05:00'::timestamp AS hora_solicitud,
        NULL::timestamp AS hora_reclamo,
        '2026-05-21 11:00:00'::timestamp AS expiracion_at,
        'OPERATIVA' AS tipo_asignacion
    ) r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
  `);
  console.log(`  Franja resultante: "${sim3.rows[0].modalidad}"`);
  console.log(`  ${sim3.rows[0].modalidad === 'subsidiado' ? '✅ CORRECTO: subsidio intacto' : '⚠️ REGRESIÓN'}`);

  // ──── Simular: flujo normal venta libre (12:00 almuerzo) ────
  console.log('\n─── Simulación: flujo normal venta libre almuerzo 12:00 ───');
  const sim4 = await pool.query(`
    SELECT (${modalidadExpr}) AS modalidad
    FROM (
      SELECT 4 AS id, 2 AS student_id, 3 AS bono_diario_id,
        'reclamado' AS estado,
        '2026-05-21 12:00:00'::timestamp AS hora_solicitud,
        '2026-05-21 12:01:00'::timestamp AS hora_reclamo,
        NULL::timestamp AS expiracion_at,
        'OPERATIVA' AS tipo_asignacion
    ) r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
  `);
  console.log(`  Franja resultante: "${sim4.rows[0].modalidad}"`);
  console.log(`  ${sim4.rows[0].modalidad === 'venta_libre' ? '✅ CORRECTO' : '⚠️ REGRESIÓN'}`);

  // ──── Simular: hora fuera de ventana (operativa normal) ────
  console.log('\n─── Simulación: operativa normal fuera de ventana 15:00 ───');
  const sim5 = await pool.query(`
    SELECT (${modalidadExpr}) AS modalidad
    FROM (
      SELECT 5 AS id, 3 AS student_id, 3 AS bono_diario_id,
        'reclamado' AS estado,
        '2026-05-21 15:00:00'::timestamp AS hora_solicitud,
        '2026-05-21 15:01:00'::timestamp AS hora_reclamo,
        NULL::timestamp AS expiracion_at,
        'OPERATIVA' AS tipo_asignacion
    ) r
    JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
  `);
  console.log(`  Franja resultante: "${sim5.rows[0].modalidad}"`);
  console.log(`  ${sim5.rows[0].modalidad === 'desconocida' ? '✅ CORRECTO: operativa fuera de ventana sigue siendo desconocida' : '⚠️ CAMBIO INESPERADO'}`);

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Validación completa.');
  console.log('═══════════════════════════════════════════════');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
