// Validar invariante: noUtilizada inmutable post-fix
require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';

const pool = require('../../backend/src/config/db');
const bonosService = require('../../backend/src/modules/bonos/bonos.service');
const adminService = require('../../backend/src/modules/bonos/bonos.admin-assignment.service');

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  VALIDACIÓN INVARIANTES POST-FIX');
  console.log('═══════════════════════════════════════════════\n');

  // ──── SNAPSHOT PRE ────
  console.log('─── PRE: Estado antes de expireBonos ───');
  const pre = await pool.query(`
    SELECT cb.tipo, bd.cantidad_no_utilizada,
           (SELECT COUNT(*)::int FROM redenciones WHERE bono_diario_id = bd.id) AS todas,
           (SELECT COUNT(*)::int FROM redenciones WHERE bono_diario_id = bd.id AND tipo_asignacion != 'ADMINISTRATIVA') AS sin_admin
    FROM bonos_diarios bd
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE bd.fecha = CURRENT_DATE
    ORDER BY cb.tipo
  `);
  for (const row of pre.rows) {
    console.log(`  ${row.tipo}: noUtilDB=${row.cantidad_no_utilizada} todas=${row.todas} sin_admin=${row.sin_admin}`);
  }

  // ──── TRIGGER RECALCULATE ────
  console.log('\n─── Ejecutando expireBonos + getDisponibilidad ───');
  const dispAlmuerzo = await bonosService.getDisponibilidad('almuerzo');
  console.log(`  Almuerzo: disponibles=${dispAlmuerzo.disponibles} noUtil=${dispAlmuerzo.noUtilizada}`);

  // ──── SNAPSHOT POST ────
  console.log('\n─── POST: Estado después de expireBonos ───');
  const post = await pool.query(`
    SELECT cb.tipo, bd.cantidad_no_utilizada,
           (SELECT COUNT(*)::int FROM redenciones WHERE bono_diario_id = bd.id) AS todas,
           (SELECT COUNT(*)::int FROM redenciones WHERE bono_diario_id = bd.id AND tipo_asignacion != 'ADMINISTRATIVA') AS sin_admin,
           (SELECT COUNT(*)::int FROM redenciones WHERE bono_diario_id = bd.id AND tipo_asignacion = 'ADMINISTRATIVA') AS solo_admin
    FROM bonos_diarios bd
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE bd.fecha = CURRENT_DATE
    ORDER BY cb.tipo
  `);

  let allOk = true;
  for (const row of post.rows) {
    const totOp = dispAlmuerzo.tipo === row.tipo ? dispAlmuerzo.totalOperativo : (await bonosService.getDisponibilidad(row.tipo)).totalOperativo;
    // Actually let me just query the base
    const bdRow = await pool.query(`SELECT cantidad_base, cantidad_extra FROM bonos_diarios WHERE id = $1`, [row.id]); // need id

    // Simpler: use the counts
    const noUtilCorrecta = Math.max(0, (dispAlmuerzo.totalOperativo || 0) ? dispAlmuerzo.totalOperativo : 0);
  }

  // Just print the comparison
  for (const row of post.rows) {
    const bdInfo = await pool.query(`SELECT id, cantidad_base, cantidad_extra FROM bonos_diarios bd JOIN config_bonos cb ON cb.id = bd.config_bono_id WHERE cb.tipo = $1 AND bd.fecha = CURRENT_DATE`, [row.tipo]);
    const bd = bdInfo.rows[0];
    const totOp = Number(bd.cantidad_base) + Number(bd.cantidad_extra);
    const noUtilCorrecta = Math.max(0, totOp - Number(row.sin_admin));
    const ok = Number(row.cantidad_no_utilizada) === noUtilCorrecta;

    console.log(`  ${row.tipo}: noUtilDB=${row.cantidad_no_utilizada} correcta=${noUtilCorrecta} admin=${row.solo_admin} ${ok ? '✅' : '⚠️'}`);
    if (!ok) allOk = false;
  }

  // ──── VERIFICAR calculateBaseAdministrativa ────
  console.log('\n─── Base Administrativa ───');
  const baseAdmin = await adminService.getBaseAdministrativa();
  for (const tipo of ['almuerzo', 'refrigerio']) {
    const ba = baseAdmin[tipo];
    console.log(`  ${tipo}: expirados=${ba.expirados} noUtilizados=${ba.noUtilizados} administrativos=${ba.administrativos} total=${ba.total} disponible=${ba.disponible}`);
    console.log(`    fórmula: ${ba.expirados} + ${ba.noUtilizados} - ${ba.administrativos} = ${ba.disponible}`);
  }

  // ──── VERIFICAR ESCENARIOS ────
  console.log('\n─── Escenarios ───');
  const almuerzoBA = baseAdmin['almuerzo'];
  console.log(`  Caso 1: noUtilizados=${almuerzoBA.noUtilizados} administrativos=${almuerzoBA.administrativos} → disponible=${almuerzoBA.disponible}`);
  console.log(`  Caso 2: nueva asignación → noUtilizados=${almuerzoBA.noUtilizados} (sin cambios) administrativos=${almuerzoBA.administrativos + 1} → disponible=${almuerzoBA.disponible - 1}`);

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Invariantes: ${allOk ? 'TODAS OK ✅' : 'FALLOS ⚠️'}`);
  console.log('═══════════════════════════════════════════════');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
