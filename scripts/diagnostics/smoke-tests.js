// SIGBA — Smoke tests post-fix
require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';

const bonosService = require('../../backend/src/modules/bonos/bonos.service');
const adminAssignmentService = require('../../backend/src/modules/bonos/bonos.admin-assignment.service');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    console.log(`  ✅ ${name}`);
    passed++;
    return result;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
    return null;
  }
}

async function asyncTest(name, promise) {
  try {
    const result = await promise;
    console.log(`  ✅ ${name}`);
    passed++;
    return result;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
    return null;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  SMOKE TESTS POST-CORRECCIÓN');
  console.log('═══════════════════════════════════════════════\n');

  // ──── Funciones exportadas ──────────────────
  console.log('─── Verificación de exports ───');
  test('requestBono exportado', () => typeof bonosService.requestBono === 'function');
  test('claimBono exportado', () => typeof bonosService.claimBono === 'function');
  test('expireBonos exportado', () => typeof bonosService.expireBonos === 'function');
  test('getDisponibilidad exportado', () => typeof bonosService.getDisponibilidad === 'function');
  test('getStudentBonos exportado', () => typeof bonosService.getStudentBonos === 'function');
  test('getResumenDiario exportado', () => typeof bonosService.getResumenDiario === 'function');
  test('getStatsDiarias exportado', () => typeof bonosService.getStatsDiarias === 'function');
  test('liberarBonos exportado', () => typeof bonosService.liberarBonos === 'function');
  test('cargarBonosExtra exportado', () => typeof bonosService.cargarBonosExtra === 'function');
  test('establecerCantidadBase exportado', () => typeof bonosService.establecerCantidadBase === 'function');
  test('getEstadoSistema exportado', () => typeof bonosService.getEstadoSistema === 'function');
  test('calcularNoUtilizada exportado', () => typeof bonosService.calcularNoUtilizada === 'function');
  test('cerrarOperacionDiaria exportado', () => typeof bonosService.cerrarOperacionDiaria === 'function');
  test('asignarAdministrativamente exportado', () => typeof adminAssignmentService.asignarAdministrativamente === 'function');
  test('getBaseAdministrativa exportado', () => typeof adminAssignmentService.getBaseAdministrativa === 'function');

  // ──── Read operations (deben funcionar sin errores) ──
  console.log('\n─── Operaciones de lectura ───');
  await asyncTest('getDisponibilidad("almuerzo")', bonosService.getDisponibilidad('almuerzo'));
  await asyncTest('getDisponibilidad("refrigerio")', bonosService.getDisponibilidad('refrigerio'));
  await asyncTest('getEstadoSistema("almuerzo")', bonosService.getEstadoSistema('almuerzo'));
  await asyncTest('getEstadoSistema("refrigerio")', bonosService.getEstadoSistema('refrigerio'));

  // getStudentBonos requires valid student ID
  const studentResult = await asyncTest('getStudentBonos(999999)', bonosService.getStudentBonos(999999));
  if (studentResult) console.log(`    (${studentResult.length} bonos para student 999999)`);

  // getResumenDiario (sin filtros)
  await asyncTest('getResumenDiario()', bonosService.getResumenDiario());
  await asyncTest('getStatsDiarias()', bonosService.getStatsDiarias());
  await asyncTest('getBaseAdministrativa()', adminAssignmentService.getBaseAdministrativa());

  // ──── expireBonos standalone ──
  console.log('\n─── expireBonos standalone ───');
  const expired = await asyncTest('expireBonos()', bonosService.expireBonos());
  if (expired) console.log(`    (${expired.length} bonos expirados)`);

  // ──── Validación post-expireBonos ──
  console.log('\n─── Estado post-expireBonos ───');
  const dispAlmuerzo = await asyncTest('getDisponibilidad post-expire', bonosService.getDisponibilidad('almuerzo'));
  if (dispAlmuerzo) {
    console.log(`    disponibles=${dispAlmuerzo.disponibles} noUtilizada=${dispAlmuerzo.noUtilizada} expirados=${dispAlmuerzo.expirados}`);
  }

  // ──── Resumen ──
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Resultado: ${passed}✅ / ${failed}❌ fallidos`);
  if (failed === 0) {
    console.log('  SIN REGRESIONES DETECTADAS');
  } else {
    console.log(`  ⚠️  ${failed} regresiones requieren atención`);
  }
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
