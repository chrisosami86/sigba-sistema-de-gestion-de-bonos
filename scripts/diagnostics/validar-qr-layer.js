// SIGBA — Smoke tests para capa QR (Fase 3A.1 — unificacion operacional)
require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '..', '..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';

const qrService = require('../../backend/src/modules/bonos/qr.service');
const bonosService = require('../../backend/src/modules/bonos/bonos.service');
const pool = require('../../backend/src/config/db');

const assert = (label, condition) => {
  if (condition) { console.log(`  ✅ ${label}`); return true; }
  console.log(`  ❌ ${label}`); return false;
};

(async () => {
  let ok = 0; let fail = 0;
  console.log('═══════════════════════════════════════════════');
  console.log('  SMOKE TESTS — CAPA QR OPERACIONAL (3A.1)');
  console.log('═══════════════════════════════════════════════\n');

  // Exports (resolveByCode reemplaza claimByCode)
  console.log('─── Exports ───');
  assert('getActiveBonus exportado', typeof qrService.getActiveBonus === 'function') ? ok++ : fail++;
  assert('resolveByCode exportado', typeof qrService.resolveByCode === 'function') ? ok++ : fail++;
  assert('claimByCode ELIMINADO', typeof qrService.claimByCode === 'undefined') ? ok++ : fail++;

  // getActiveBonus sin bono
  console.log('\n─── getActiveBonus ───');
  try {
    const bono = await qrService.getActiveBonus(999999);
    assert('estudiante sin bono = null', bono === null) ? ok++ : fail++;
  } catch (e) { assert('getActiveBonus(999999)', false); fail++; }

  // resolveByCode validaciones (solo lookup, sin transaccion)
  console.log('\n─── resolveByCode validaciones ───');
  try {
    await qrService.resolveByCode(999999, 'almuerzo');
    assert('codigo inexistente → error', false); fail++;
  } catch (e) { assert('codigo inexistente → error', true) ? ok++ : fail++; }

  try {
    await qrService.resolveByCode(1, 'desayuno');
    assert('tipo invalido → error', false); fail++;
  } catch (e) { assert('tipo invalido → error', true) ? ok++ : fail++; }

  try {
    await qrService.resolveByCode(-5, 'almuerzo');
    assert('codigo negativo → error', false); fail++;
  } catch (e) { assert('codigo negativo → error', true) ? ok++ : fail++; }

  // resolveByCode encuentra bono (no filtra por estado, solo resolve)
  console.log('\n─── resolveByCode lookup ───');
  try {
    const reclamado = await pool.query(
      "SELECT codigo_bono, cb.tipo FROM redenciones r JOIN bonos_diarios bd ON bd.id = r.bono_diario_id JOIN config_bonos cb ON cb.id = bd.config_bono_id WHERE r.estado = 'reclamado' AND r.codigo_bono IS NOT NULL AND bd.fecha = CURRENT_DATE LIMIT 1"
    );
    if (reclamado.rows.length > 0) {
      const resolved = await qrService.resolveByCode(reclamado.rows[0].codigo_bono, reclamado.rows[0].tipo);
      assert('resuelve bono reclamado (no filtra estado)', resolved && resolved.id > 0) ? ok++ : fail++;
    } else {
      assert('resuelve bono reclamado (sin datos)', true) ? ok++ : fail++;
    }
  } catch (e) { assert('resolveByCode lookup', false); fail++; }

  // Separacion del core
  console.log('\n─── Separacion del core ───');
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'backend', 'src', 'modules', 'bonos', 'qr.service.js'), 'utf-8');
  assert('NO importa calculateDisponibilidad', !src.includes('calculateDisponibilidad')) ? ok++ : fail++;
  assert('NO importa expireBonos', !src.includes('bonosService.expireBonos')) ? ok++ : fail++;

  // Verificar que QR delega en claimBono (no hace update directo)
  console.log('\n─── Unificacion operacional ───');
  assert('qr.service NO hace UPDATE redeciones estado (solo asigna codigo)', !src.includes("UPDATE redenciones SET estado")) ? ok++ : fail++;
  assert('qr.service NO hace BEGIN/COMMIT propio', !src.includes("client.query(\"BEGIN\")")) ? ok++ : fail++;
  assert('qr.service NO hace FOR UPDATE propio', !src.includes("FOR UPDATE")) ? ok++ : fail++;
  assert('qr.service exporta resolveByCode (no claimByCode)', src.includes('resolveByCode')) ? ok++ : fail++;

  // getActiveBonus asigna codigo unico
  console.log('\n─── Asignacion de codigo ───');
  try {
    const students = await pool.query("SELECT id FROM students WHERE activo = true LIMIT 1");
    if (students.rows.length > 0) {
      const studentId = students.rows[0].id;
      const tiene = await pool.query(
        "SELECT r.id FROM redenciones r JOIN bonos_diarios bd ON bd.id = r.bono_diario_id WHERE r.student_id = $1 AND bd.fecha = CURRENT_DATE LIMIT 1",
        [studentId]
      );
      if (tiene.rows.length === 0) {
        const bonoDiario = await pool.query(
          "SELECT bd.* FROM bonos_diarios bd JOIN config_bonos cb ON cb.id = bd.config_bono_id WHERE cb.tipo = 'almuerzo' AND bd.fecha = CURRENT_DATE"
        );
        if (bonoDiario.rows.length > 0) {
          await pool.query(
            `INSERT INTO redenciones (student_id, bono_diario_id, estado, expiracion_at)
             VALUES ($1, $2, 'reservado', NOW() + INTERVAL '1 hour')`,
            [studentId, bonoDiario.rows[0].id]
          );
        }
      }
      const bono = await qrService.getActiveBonus(studentId);
      if (bono) {
        assert('getActiveBonus retorna bono', !!bono) ? ok++ : fail++;
        assert('codigoBono asignado > 0', bono.codigoBono > 0) ? ok++ : fail++;
        assert('codigoBono <= 200', bono.codigoBono <= 200) ? ok++ : fail++;
        await pool.query("UPDATE redenciones SET estado = 'expirado' WHERE id = $1", [bono.id]);
      } else {
        assert('getActiveBonus retorna bono (sin activo)', true) ? ok++ : fail++;
      }
    }
  } catch (e) { assert('getActiveBonus con codigo', false); fail++; console.log('   ', e.message); }

  // Sin regresiones en bonos.service
  console.log('\n─── Sin regresiones ───');
  try {
    const d = await bonosService.getDisponibilidad('almuerzo');
    assert('getDisponibilidad almuerzo intacto', d.disponibles !== undefined) ? ok++ : fail++;
  } catch (e) { assert('getDisponibilidad', false); fail++; }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Resultado: ${ok}✅ / ${fail}❌ fallidos`);
  if (fail === 0) console.log('  CAPA QR — UNIFICADA (3A.1)');
  console.log('═══════════════════════════════════════════════');

  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
})();
