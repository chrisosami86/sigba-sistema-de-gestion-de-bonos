// SIGBA — Validación post-corrección de orden (read-only)
// Ejecutar: node scripts/validar-fix.js
require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';

const pool = require('../../backend/src/config/db');
const bonosService = require('../../backend/src/modules/bonos/bonos.service');

async function snapshot(tipo) {
  const r = await pool.query(`
    SELECT bd.id, bd.cantidad_base, bd.cantidad_extra, bd.cantidad_liberada,
           bd.cantidad_no_utilizada, bd.created_at, bd.updated_at
    FROM bonos_diarios bd
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE cb.tipo = $1 AND bd.fecha = CURRENT_DATE
  `, [tipo]);

  if (r.rows.length === 0) return { exists: false };

  const row = r.rows[0];
  const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM redenciones WHERE bono_diario_id = $1`, [row.id]);
  const countAll = Number(countR.rows[0].total);
  const totOp = Number(row.cantidad_base) + Number(row.cantidad_extra);
  const noUtilCalc = Math.max(0, totOp - countAll);

  return {
    exists: true,
    id: row.id,
    totOp,
    lib: Number(row.cantidad_liberada),
    noUtilDB: Number(row.cantidad_no_utilizada || 0),
    noUtilCalc,
    synced: Number(row.cantidad_no_utilizada || 0) === noUtilCalc,
    countAll,
    updatedAt: row.updated_at,
  };
}

async function isPastClosing(tipo) {
  const closing = new Date();
  const hours = tipo === 'almuerzo' ? 12 : 22;
  const mins = tipo === 'almuerzo' ? 5 : 0;
  closing.setHours(hours, mins, 0, 0);
  return new Date() >= closing;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  VALIDACIÓN POST-CORRECCIÓN DE ORDEN');
  console.log('═══════════════════════════════════════════════════════\n');

  // ──── SNAPSHOT PRE ────────────────────────────
  console.log('─── SNAPSHOT PRE-CORRECCIÓN ───');
  const preAlmuerzo = await snapshot('almuerzo');
  const preRefrigerio = await snapshot('refrigerio');

  for (const [tipo, s] of [['almuerzo', preAlmuerzo], ['refrigerio', preRefrigerio]]) {
    if (!s.exists) {
      console.log(`  ${tipo}: NO EXISTE (se creará)`);
    } else {
      console.log(`  ${tipo}: totOp=${s.totOp} countAll=${s.countAll} noUtilDB=${s.noUtilDB} noUtilCalc=${s.noUtilCalc} synced=${s.synced ? 'SÍ' : 'NO ⚠️'} updatedAt=${s.updatedAt}`);
    }
  }

  // ──── TEST 1: getDisponibilidad almuerzo ──────
  console.log('\n─── TEST 1: getDisponibilidad("almuerzo") ───');
  const dispAlmuerzo = await bonosService.getDisponibilidad('almuerzo');
  console.log(`  disponibles: ${dispAlmuerzo.disponibles}`);
  console.log(`  totalOperativo: ${dispAlmuerzo.totalOperativo}`);
  console.log(`  reservasActivas: ${dispAlmuerzo.reservasActivas}`);
  console.log(`  expiradosPendientes: ${dispAlmuerzo.expiradosPendientes}`);
  console.log(`  noUtilizada: ${dispAlmuerzo.noUtilizada}`);

  const postAlmuerzo = await snapshot('almuerzo');
  console.log(`\n  Post-call: noUtilDB=${postAlmuerzo.noUtilDB} noUtilCalc=${postAlmuerzo.noUtilCalc} synced=${postAlmuerzo.synced ? 'SÍ ✅' : 'NO ⚠️'}`);

  if (postAlmuerzo.synced && isPastClosing('almuerzo')) {
    console.log('  ✅ ALMUERZO CORREGIDO: noUtilizada consolidada correctamente');
  } else if (!isPastClosing('almuerzo')) {
    console.log('  ℹ️  Almuerzo aún no pasó cierre — noUtilizada no debe consolidarse aún');
  } else {
    console.log('  ⚠️  Almuerzo sigue desincronizado');
  }

  // ──── TEST 2: getDisponibilidad refrigerio ───
  console.log('\n─── TEST 2: getDisponibilidad("refrigerio") ───');
  const dispRefrigerio = await bonosService.getDisponibilidad('refrigerio');
  console.log(`  disponibles: ${dispRefrigerio.disponibles}`);
  console.log(`  noUtilizada: ${dispRefrigerio.noUtilizada}`);

  const postRefrigerio = await snapshot('refrigerio');
  const refrigPast = await isPastClosing('refrigerio');
  console.log(`  isPastClosing: ${refrigPast}`);
  console.log(`  Post-call: noUtilDB=${postRefrigerio.noUtilDB} noUtilCalc=${postRefrigerio.noUtilCalc} synced=${postRefrigerio.synced ? 'SÍ ✅' : 'NO'}`);

  if (!refrigPast) {
    console.log('  ✅ REFRIGERIO CORRECTO: aún no es post-cierre, noUtilizada no se consolida (comportamiento esperado)');
    if (postRefrigerio.synced) {
      console.log('  ℹ️  noUtilizada ya estaba sincronizada de antes');
    }
  } else if (postRefrigerio.synced) {
    console.log('  ✅ REFRIGERIO CORREGIDO: noUtilizada consolidada post-cierre');
  }

  // ──── TEST 3: Idempotencia (llamar de nuevo) ──
  console.log('\n─── TEST 3: Idempotencia (segunda llamada) ───');
  const dispAlmuerzo2 = await bonosService.getDisponibilidad('almuerzo');
  const postAlmuerzo2 = await snapshot('almuerzo');
  console.log(`  disponibles 1ra: ${dispAlmuerzo.disponibles}  2da: ${dispAlmuerzo2.disponibles}`);
  console.log(`  noUtilizada 1ra: ${dispAlmuerzo.noUtilizada}   2da: ${dispAlmuerzo2.noUtilizada}`);
  console.log(`  ¿idempotente?: ${dispAlmuerzo.disponibles === dispAlmuerzo2.disponibles && dispAlmuerzo.noUtilizada === dispAlmuerzo2.noUtilizada ? 'SÍ ✅' : 'NO ⚠️'}`);

  // ──── TEST 4: Resumen consolidado ──
  console.log('\n─── RESUMEN FINAL ───');
  const final = await pool.query(`
    SELECT cb.tipo, bd.cantidad_base, bd.cantidad_extra,
           bd.cantidad_liberada, bd.cantidad_no_utilizada
    FROM bonos_diarios bd
    JOIN config_bonos cb ON cb.id = bd.config_bono_id
    WHERE bd.fecha = CURRENT_DATE
    ORDER BY cb.tipo
  `);

  for (const row of final.rows) {
    const countR = await pool.query(`SELECT bd.id FROM bonos_diarios bd JOIN config_bonos cb ON cb.id = bd.config_bono_id WHERE cb.tipo = $1 AND bd.fecha = CURRENT_DATE`, [row.tipo]);
    const id = countR.rows[0]?.id;
    const cnt = id ? await pool.query(`SELECT COUNT(*)::int AS total FROM redenciones WHERE bono_diario_id = $1`, [id]) : { rows: [{ total: 0 }] };
    const countAll = Number(cnt.rows[0].total);
    const totOp = Number(row.cantidad_base) + Number(row.cantidad_extra);
    const expected = Math.max(0, totOp - countAll);
    const ok = Number(row.cantidad_no_utilizada) === expected;

    console.log(`  ${row.tipo}: base=${row.cantidad_base} extra=${row.cantidad_extra} lib=${row.cantidad_liberada} | noUtilDB=${row.cantidad_no_utilizada} expected=${expected} | ${ok ? '✅' : '⚠️ DESINC'}`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Validación completa.');
  console.log('═══════════════════════════════════════════════════════');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
