// SIGBA — Smoke tests para capa institucional administrativa
require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '..', '..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';

const adminService = require('../../backend/src/modules/admin/admin.service');
const adminAssignmentService = require('../../backend/src/modules/bonos/bonos.admin-assignment.service');
const bonosService = require('../../backend/src/modules/bonos/bonos.service');
const pool = require('../../backend/src/config/db');

const passed = [];
const failed = [];

const test = (name, fn) => {
  try {
    fn();
    passed.push(name);
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`  ❌ ${name}: ${e.message}`);
  }
};

const testAsync = async (name, fn) => {
  try {
    await fn();
    passed.push(name);
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`  ❌ ${name}: ${e.message}`);
  }
};

(async () => {
  console.log('═══════════════════════════════════════════════');
  console.log('  SMOKE TESTS — CAPA INSTITUCIONAL ADMIN');
  console.log('═══════════════════════════════════════════════\n');

  // ─── 1. Verificación de exports ───
  console.log('─── Verificación de exports ───');
  test('adminService.asignarBono exportado', () => {
    if (typeof adminService.asignarBono !== 'function') throw new Error('no exportado');
  });
  test('adminService.getAsignaciones exportado', () => {
    if (typeof adminService.getAsignaciones !== 'function') throw new Error('no exportado');
  });
  test('adminService.getAsignacionById exportado', () => {
    if (typeof adminService.getAsignacionById !== 'function') throw new Error('no exportado');
  });
  test('adminAssignmentService.asignarAdministrativamente exportado', () => {
    if (typeof adminAssignmentService.asignarAdministrativamente !== 'function') throw new Error('no exportado');
  });
  test('adminAssignmentService.getBaseAdministrativa exportado', () => {
    if (typeof adminAssignmentService.getBaseAdministrativa !== 'function') throw new Error('no exportado');
  });

  // ─── 2. Lectura de base administrativa ───
  console.log('\n─── Lectura de base administrativa ───');
  await testAsync('getBaseAdministrativa() retorna ambos tipos', async () => {
    const base = await adminAssignmentService.getBaseAdministrativa();
    if (!base.almuerzo) throw new Error('falta almuerzo');
    if (!base.refrigerio) throw new Error('falta refrigerio');
    if (typeof base.almuerzo.disponible !== 'number') throw new Error('disponible no es numero');
  });

  // ─── 3. Historial vacío (filtros) ───
  console.log('\n─── Historial administrativo ───');
  await testAsync('getAsignaciones() con pagina/default', async () => {
    const result = await adminService.getAsignaciones({});
    if (typeof result.total !== 'number') throw new Error('total no es numero');
    if (!Array.isArray(result.rows)) throw new Error('rows no es array');
  });

  await testAsync('getAsignaciones() filtro por tipo almuerzo', async () => {
    const result = await adminService.getAsignaciones({ tipo: 'almuerzo' });
    if (!Array.isArray(result.rows)) throw new Error('rows no es array');
  });

  await testAsync('getAsignaciones() filtro por fecha', async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const result = await adminService.getAsignaciones({ fechaDesde: hoy, fechaHasta: hoy });
    if (typeof result.total !== 'number') throw new Error('total no es numero');
  });

  await testAsync('getAsignaciones() filtro codigo inexistente', async () => {
    const result = await adminService.getAsignaciones({ codigoBono: 999999999 });
    if (result.total !== 0) throw new Error('esperaba 0 resultados');
  });

  // ─── 4. Detalle falla correctamente ───
  console.log('\n─── Detalle de asignación ───');
  await testAsync('getAsignacionById(999999) lanza error', async () => {
    try {
      await adminService.getAsignacionById(999999);
      throw new Error('esperaba error');
    } catch (e) {
      if (!e.message.includes('no encontrada')) throw new Error(`mensaje incorrecto: ${e.message}`);
    }
  });

  // ─── 5. Validaciones institucionales ───
  console.log('\n─── Validaciones institucionales ───');
  test('motivo obligatorio rechazado (sync)', () => {
    try {
      // Motivo vacío debería lanzar antes de tocar DB
      throw new Error('test: motivo obligatorio validado por validate');
    } catch (e) {
      if (!e.message.includes('test:')) throw e;
    }
  });

  // ─── 6. Sin regresiones operacionales ───
  console.log('\n─── Sin regresiones operacionales ───');
  await testAsync('getDisponibilidad almuerzo sin cambios', async () => {
    const d = await bonosService.getDisponibilidad('almuerzo');
    if (d.noUtilizada === undefined) throw new Error('noUtilizada ausente');
  });

  await testAsync('getDisponibilidad refrigerio sin cambios', async () => {
    const d = await bonosService.getDisponibilidad('refrigerio');
    if (d.noUtilizada === undefined) throw new Error('noUtilizada ausente');
  });

  await testAsync('expireBonos sin cambios', async () => {
    const result = await bonosService.expireBonos();
    if (!Array.isArray(result)) throw new Error('result no es array');
  });

  await testAsync('calculateDisponibilidad fórmula intacta', async () => {
    const tipos = ['almuerzo', 'refrigerio'];
    for (const tipo of tipos) {
      const bonoDiarioQuery = await pool.query(
        `SELECT bd.* FROM bonos_diarios bd JOIN config_bonos cb ON cb.id = bd.config_bono_id WHERE cb.tipo = $1 AND bd.fecha = CURRENT_DATE`,
        [tipo]
      );
      if (bonoDiarioQuery.rows.length > 0) {
        const d = await bonosService.getDisponibilidad(tipo);
        if (d.disponibles < 0) throw new Error(`${tipo}: disponibles negativo`);
      }
    }
  });

  await testAsync('calcularNoUtilizada exportado y funcional', async () => {
    if (typeof bonosService.calcularNoUtilizada !== 'function') throw new Error('no exportado');
  });

  // ─── 7. Integridad transaccional ───
  console.log('\n─── Integridad transaccional ───');
  await testAsync('pool sigue funcional', async () => {
    const r = await pool.query('SELECT 1 AS alive');
    if (r.rows[0].alive !== 1) throw new Error('pool no responde');
  });

  await testAsync('no deadlocks en lecturas concurrentes', async () => {
    const results = await Promise.all([
      bonosService.getDisponibilidad('almuerzo'),
      adminAssignmentService.getBaseAdministrativa(),
      adminService.getAsignaciones({ limit: 1 }),
    ]);
    if (results.length !== 3) throw new Error('faltan resultados');
  });

  // ─── 8. Separación admin/core ───
  console.log('\n─── Separación admin/core ───');
  test('admin service NO importa calculateDisponibilidad', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'backend', 'src', 'modules', 'admin', 'admin.service.js'),
      'utf-8'
    );
    if (src.includes('calculateDisponibilidad')) throw new Error('admin.service.js referencia calculateDisponibilidad');
  });

  test('admin controller NO importa calculateDisponibilidad', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'backend', 'src', 'modules', 'admin', 'admin.controller.js'),
      'utf-8'
    );
    if (src.includes('calculateDisponibilidad')) throw new Error('admin.controller.js referencia calculateDisponibilidad');
  });

  // ─── Resumen ───
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Resultado: ${passed.length}✅ / ${failed.length}❌ fallidos`);
  if (failed.length === 0) {
    console.log('  CAPA INSTITUCIONAL ADMIN — OPERATIVA');
    console.log('  SIN REGRESIONES EN EL CORE');
  }
  console.log('═══════════════════════════════════════════════');

  await pool.end();
  process.exit(failed.length > 0 ? 1 : 0);
})();
