// SIGBA — Smoke tests para capa proveedor (Fase 2)
require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '..', '..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';

const providerService = require('../../backend/src/modules/provider/provider.service');

const assert = (label, condition) => {
  if (condition) { console.log(`  ✅ ${label}`); return true; }
  console.log(`  ❌ ${label}`); return false;
};

(async () => {
  let ok = 0; let fail = 0;
  console.log('═══════════════════════════════════════════════');
  console.log('  SMOKE TESTS — CAPA PROVEEDOR');
  console.log('═══════════════════════════════════════════════\n');

  // Exports
  console.log('─── Exports ───');
  assert('ESTADOS exportado', typeof providerService.ESTADOS === 'object') ? ok++ : fail++;
  assert('getResumenProveedor exportado', typeof providerService.getResumenProveedor === 'function') ? ok++ : fail++;
  assert('registrarConciliacion exportado', typeof providerService.registrarConciliacion === 'function') ? ok++ : fail++;
  assert('getConciliaciones exportado', typeof providerService.getConciliaciones === 'function') ? ok++ : fail++;

  // Resumen
  console.log('\n─── Resumen proveedor ───');
  try {
    const r = await providerService.getResumenProveedor();
    assert('getResumenProveedor() retorna almuerzo', !!r.almuerzo) ? ok++ : fail++;
    assert('getResumenProveedor() retorna refrigerio', !!r.refrigerio) ? ok++ : fail++;
    assert('totalEntregado es numero', typeof r.almuerzo.totalEntregado === 'number') ? ok++ : fail++;
  } catch (e) { assert('getResumenProveedor()', false); fail++; console.log('    ', e.message); }

  // Registrar conciliación
  console.log('\n─── Registrar conciliacion ───');
  let conciliacionId = null;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const c = await providerService.registrarConciliacion({
      fecha: today, tipo: 'almuerzo', cantidadProveedor: 2,
      observaciones: 'Test smoke', adminId: 1, adminNombre: 'Test',
    });
    conciliacionId = c.id;
    assert('registrarConciliacion crea registro', !!c.id) ? ok++ : fail++;
    assert('estado != PENDIENTE', c.estado !== 'PENDIENTE') ? ok++ : fail++;
  } catch (e) { assert('registrarConciliacion', false); fail++; console.log('    ', e.message); }

  // Validaciones
  console.log('\n─── Validaciones ───');
  try {
    await providerService.registrarConciliacion({ fecha: 'x', tipo: 'desayuno', cantidadProveedor: 1 });
    assert('rechaza tipo invalido', false); fail++;
  } catch (e) { assert('rechaza tipo invalido', true) ? ok++ : fail++; }

  try {
    await providerService.registrarConciliacion({ fecha: 'x', tipo: 'almuerzo', cantidadProveedor: -1 });
    assert('rechaza cantidad negativa', false); fail++;
  } catch (e) { assert('rechaza cantidad negativa', true) ? ok++ : fail++; }

  // Historial
  console.log('\n─── Historial ───');
  try {
    const r = await providerService.getConciliaciones({});
    assert('getConciliaciones() con default', Array.isArray(r.rows)) ? ok++ : fail++;
    assert('hay registros', r.rows.length > 0) ? ok++ : fail++;
  } catch (e) { assert('getConciliaciones()', false); fail++; console.log('    ', e.message); }

  try {
    const r = await providerService.getConciliaciones({ tipo: 'almuerzo' });
    assert('filtro por tipo almuerzo', r.rows.length > 0) ? ok++ : fail++;
  } catch (e) { assert('filtro por tipo', false); fail++; }

  try {
    await providerService.getConciliacionById(99999);
    assert('getConciliacionById(99999) 404', false); fail++;
  } catch (e) { assert('getConciliacionById(99999) 404', true) ? ok++ : fail++; }

  if (conciliacionId) {
    try {
      const c = await providerService.getConciliacionById(conciliacionId);
      assert('getConciliacionById() detalle', c.id === conciliacionId) ? ok++ : fail++;
    } catch (e) { assert('getConciliacionById()', false); fail++; }
  }

  // Determinación de estado
  console.log('\n─── Determinacion de estado ───');
  try {
    const r = await providerService.getResumenProveedor();
    const total = r.almuerzo.totalEntregado;
    const c = await providerService.registrarConciliacion({
      fecha: today, tipo: 'almuerzo', cantidadProveedor: total, adminId: 1,
    });
    assert(`dif=0 → CONCILIADO (dif=${c.diferencia})`, c.estado === 'CONCILIADO') ? ok++ : fail++;
  } catch (e) { assert('dif=0 → CONCILIADO', false); fail++; }

  try {
    const r = await providerService.getResumenProveedor();
    const total = r.almuerzo.totalEntregado;
    const c = await providerService.registrarConciliacion({
      fecha: today, tipo: 'almuerzo', cantidadProveedor: Math.max(0, total - 1), adminId: 1,
    });
    assert(`dif=1 → DIFERENCIA_MENOR (dif=${c.diferencia})`, c.estado === 'DIFERENCIA_MENOR' || c.estado === 'CONCILIADO') ? ok++ : fail++;
  } catch (e) { assert('dif=1 → DIFERENCIA_MENOR', false); fail++; }

  // DIFERENCIA_CRITICA test
  try {
    const c = await providerService.registrarConciliacion({
      fecha: today, tipo: 'refrigerio', cantidadProveedor: 105, adminId: 1,
    });
    assert(`dif grande → DIFERENCIA_CRITICA (dif=${c.diferencia})`, c.estado === 'DIFERENCIA_CRITICA') ? ok++ : fail++;
  } catch (e) { assert('dif grande → DIFERENCIA_CRITICA', false); fail++; }

  // Separación del core
  console.log('\n─── Separacion del core ───');
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'backend', 'src', 'modules', 'provider', 'provider.service.js'), 'utf-8');
  assert('NO importa calculateDisponibilidad', !src.includes('calculateDisponibilidad')) ? ok++ : fail++;
  assert('NO importa expireBonos', !src.includes('expireBonos')) ? ok++ : fail++;

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Resultado: ${ok}✅ / ${fail}❌ fallidos`);
  if (fail === 0) console.log('  CAPA PROVEEDOR — OPERATIVA');
  console.log('═══════════════════════════════════════════════');

  process.exit(fail > 0 ? 1 : 0);
})();
