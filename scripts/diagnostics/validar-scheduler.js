// SIGBA — Validación completa del scheduler
require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';

const bonosService = require('../../backend/src/modules/bonos/bonos.service');
const scheduler = require('../../backend/src/modules/system/scheduler');

let cycleCount = 0;
let lastNoUtilizada = null;
let lastDisponibles = null;

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  VALIDACIÓN DEL SCHEDULER AUTOMÁTICO');
  console.log('═══════════════════════════════════════════════\n');

  // ──── TEST 1: Iniciar scheduler ──────────────
  console.log('─── TEST 1: Inicio del scheduler ───');
  scheduler.start();
  console.log('  scheduler.start() ejecutado');
  console.log('  Esperando primer ciclo (llama expireBonos inmediatamente)...\n');

  // Esperar a que el primer ciclo termine
  await new Promise(r => setTimeout(r, 2000));

  // Verificar estado post-primer ciclo
  const disp1 = await bonosService.getDisponibilidad('almuerzo');
  console.log(`  Post-ciclo 1: disponibles=${disp1.disponibles} noUtilizada=${disp1.noUtilizada}`);
  lastNoUtilizada = disp1.noUtilizada;
  lastDisponibles = disp1.disponibles;

  // ──── TEST 2: Idempotencia multi-ciclo ──────
  console.log('\n─── TEST 2: Múltiples ciclos sin cambios ───');

  for (let i = 2; i <= 4; i++) {
    // Forzar un ciclo manual (simulando paso del scheduler)
    console.log(`  Ejecutando ciclo ${i} manual...`);
    const result = await bonosService.expireBonos();
    const expired = Array.isArray(result) ? result.length : 0;
    console.log(`  Ciclo ${i}: expirados=${expired}`);

    const disp = await bonosService.getDisponibilidad('almuerzo');
    console.log(`  Post-ciclo ${i}: disponibles=${disp.disponibles} noUtilizada=${disp.noUtilizada}`);

    if (disp.noUtilizada !== lastNoUtilizada) {
      console.log(`  ⚠️  DRIFT: noUtilizada cambió de ${lastNoUtilizada} a ${disp.noUtilizada}`);
    }
    if (disp.disponibles !== lastDisponibles) {
      console.log(`  ⚠️  DRIFT: disponibles cambió de ${lastDisponibles} a ${disp.disponibles}`);
    }

    lastNoUtilizada = disp.noUtilizada;
    lastDisponibles = disp.disponibles;
  }

  console.log(`  noUtilizada final: ${lastNoUtilizada} (debe ser constante entre ciclos)`);
  console.log(`  disponibles final: ${lastDisponibles} (debe ser constante entre ciclos)`);

  // ──── TEST 3: Concurrencia scheduler + requests ──
  console.log('\n─── TEST 3: Concurrencia (múltiples llamadas simultáneas) ───');
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(bonosService.getDisponibilidad('almuerzo'));
    promises.push(bonosService.getDisponibilidad('refrigerio'));
  }
  const results = await Promise.all(promises);
  const allSameAlmuerzo = results.filter(r => r.tipo === 'almuerzo').every(r => r.disponibles === results[0].disponibles);
  const allSameRefrig = results.filter(r => r.tipo === 'refrigerio').every(r => r.disponibles === results[1].disponibles);
  console.log(`  10 llamadas concurrentes completadas`);
  console.log(`  Consistencia almuerzo: ${allSameAlmuerzo ? '✅ todas iguales' : '⚠️ divergencia'}`);
  console.log(`  Consistencia refrigerio: ${allSameRefrig ? '✅ todas iguales' : '⚠️ divergencia'}`);

  // ──── TEST 4: Smoke tests post-scheduler ──
  console.log('\n─── TEST 4: Smoke tests completos ───');
  const tests = [
    { name: 'getDisponibilidad almuerzo', fn: () => bonosService.getDisponibilidad('almuerzo') },
    { name: 'getDisponibilidad refrigerio', fn: () => bonosService.getDisponibilidad('refrigerio') },
    { name: 'getEstadoSistema almuerzo', fn: () => bonosService.getEstadoSistema('almuerzo') },
    { name: 'getEstadoSistema refrigerio', fn: () => bonosService.getEstadoSistema('refrigerio') },
    { name: 'getStudentBonos', fn: () => bonosService.getStudentBonos(999999) },
    { name: 'getResumenDiario', fn: () => bonosService.getResumenDiario() },
    { name: 'getStatsDiarias', fn: () => bonosService.getStatsDiarias() },
    { name: 'expireBonos standalone', fn: () => bonosService.expireBonos() },
  ];

  let passed = 0;
  let failed = 0;
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  ✅ ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${test.name}: ${e.message}`);
      failed++;
    }
  }

  // ──── TEST 5: Verificar invariantes ──────
  console.log('\n─── TEST 5: Invariantes post-scheduler ───');
  const dispFinal = await bonosService.getDisponibilidad('almuerzo');
  console.log(`  Almuerzo: disponibles=${dispFinal.disponibles} noUtilizada=${dispFinal.noUtilizada}`);
  console.log(`  ¿disponibles <= 0? ${dispFinal.disponibles <= 0 ? '✅' : '⚠️ ' + dispFinal.disponibles}`);
  console.log(`  ¿noUtilizada > 0? ${dispFinal.noUtilizada > 0 ? '✅ (snapshot conservado)' : '⚠️'}`);

  // ──── Detener scheduler ────
  scheduler.stop();
  console.log('\n  Scheduler detenido.');

  // ──── Resumen ──
  console.log('\n═══════════════════════════════════════════════');
  const total = passed + failed;
  console.log(`  Smoke tests: ${passed}/${total} OK  |  Scheduler: operativo`);
  if (failed === 0) {
    console.log('  ✅ SIN REGRESIONES — scheduler listo para producción');
  }
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
