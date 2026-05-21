// SIGBA — Diagnóstico de cierre operacional
// Ejecutar: node scripts/diagnostico-cierre.js
require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';

const pool = require('../../backend/src/config/db');

const HORARIOS = {
  almuerzo: {
    subsidiado:    { inicio: 8*60, fin: 10*60+15, expiracion: { hours: 11, minutes: 0 } },
    ventaLibre:    { inicio: 11*60+30, fin: 12*60+5, expiracion: { hours: 12, minutes: 5 } },
  },
  refrigerio: {
    subsidiado:    { inicio: 17*60, fin: 18*60+29, expiracion: { hours: 21, minutes: 30 } },
    ventaLibre:    { inicio: 18*60+30, fin: 22*60, expiracion: { hours: 22, minutes: 0 } },
  },
};

const getClosingTime = (tipo) => {
  const closing = new Date();
  closing.setHours(HORARIOS[tipo].ventaLibre.expiracion.hours, HORARIOS[tipo].ventaLibre.expiracion.minutes, 0, 0);
  return closing;
};

const isPastClosing = (tipo) => {
  return new Date() >= getClosingTime(tipo);
};

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  SIGBA — Diagnóstico de Cierre Operacional');
  console.log('═══════════════════════════════════════════════\n');

  // ──── TIMEZONE ────────────────────────────
  console.log('─── TIMESTAMP ───');
  const nodeNow = new Date();
  console.log(`  Node.js now:        ${nodeNow.toISOString()}`);
  console.log(`  Node.js local:      ${nodeNow.toString()}`);
  console.log(`  Node.js TZ env:     ${process.env.TZ}`);

  try {
    const pgResult = await pool.query("SELECT NOW() AS pg_now, CURRENT_DATE AS pg_date, current_setting('timezone') AS pg_tz");
    console.log(`  PostgreSQL NOW():   ${pgResult.rows[0].pg_now}`);
    console.log(`  PostgreSQL DATE:    ${pgResult.rows[0].pg_date}`);
    console.log(`  PostgreSQL TZ:      ${pgResult.rows[0].pg_tz}`);
  } catch (e) {
    console.log(`  PostgreSQL:         NO DISPONIBLE (${e.message})`);
  }

  // ──── HORARIOS ───────────────────────────
  console.log('\n─── HORARIOS ───');
  for (const tipo of ['almuerzo', 'refrigerio']) {
    const h = HORARIOS[tipo];
    const closing = getClosingTime(tipo);
    const past = isPastClosing(tipo);
    console.log(`  ${tipo}:`);
    console.log(`    Subsidio:     ${String(Math.floor(h.subsidiado.inicio/60)).padStart(2,'0')}:${String(h.subsidiado.inicio%60).padStart(2,'0')} ─ ${String(Math.floor(h.subsidiado.fin/60)).padStart(2,'0')}:${String(h.subsidiado.fin%60).padStart(2,'0')}`);
    console.log(`    Exp.subsidio: ${String(h.subsidiado.expiracion.hours).padStart(2,'0')}:${String(h.subsidiado.expiracion.minutes).padStart(2,'0')}`);
    console.log(`    Venta libre:  ${String(Math.floor(h.ventaLibre.inicio/60)).padStart(2,'0')}:${String(h.ventaLibre.inicio%60).padStart(2,'0')} ─ ${String(Math.floor(h.ventaLibre.fin/60)).padStart(2,'0')}:${String(h.ventaLibre.fin%60).padStart(2,'0')}`);
    console.log(`    Cierre total: ${String(h.ventaLibre.expiracion.hours).padStart(2,'0')}:${String(h.ventaLibre.expiracion.minutes).padStart(2,'0')}`);
    console.log(`    Hora cierre calculada: ${closing.toISOString()}`);
    console.log(`    isPastClosing:  ${past}`);
    console.log(`    Minutos hasta cierre: ${Math.round((closing - nodeNow) / 60000)}`);
  }

  // ──── ESTADO DE BONOS_DIARIOS HOY ───────
  console.log('\n─── BONOS DIARIOS HOY ───');
  try {
    const diarioResult = await pool.query(`
      SELECT bd.id, bd.fecha, cb.tipo,
             bd.cantidad_base, bd.cantidad_extra,
             bd.cantidad_liberada, bd.cantidad_no_utilizada,
             bd.created_at, bd.updated_at
      FROM bonos_diarios bd
      JOIN config_bonos cb ON cb.id = bd.config_bono_id
      WHERE bd.fecha = CURRENT_DATE
      ORDER BY cb.tipo
    `);

    if (diarioResult.rows.length === 0) {
      console.log('  (No hay registros de bonos_diarios para hoy)');
    }

    for (const row of diarioResult.rows) {
      console.log(`\n  ── ${row.tipo} (id=${row.id}) ──`);
      console.log(`    cantidad_base:          ${row.cantidad_base}`);
      console.log(`    cantidad_extra:         ${row.cantidad_extra}`);
      console.log(`    cantidad_liberada:      ${row.cantidad_liberada}`);
      console.log(`    cantidad_no_utilizada:  ${row.cantidad_no_utilizada}`);
      console.log(`    updated_at:             ${row.updated_at}`);

      const redencionesResult = await pool.query(`
        SELECT estado, COUNT(*)::int AS total
        FROM redenciones
        WHERE bono_diario_id = $1
        GROUP BY estado
        ORDER BY estado
      `, [row.id]);

      console.log(`\n    Redenciones:`);
      let totalRedenciones = 0;
      for (const rr of redencionesResult.rows) {
        console.log(`      ${rr.estado.padEnd(15)} ${rr.total}`);
        totalRedenciones += Number(rr.total);
      }
      if (redencionesResult.rows.length === 0) {
        console.log(`      (sin redenciones)`);
      }

      // ──── SIMULAR calculateDisponibilidad ────
      const reservados = Number(redencionesResult.rows.find(r => r.estado === 'reservado')?.total || 0);
      const reclamados = Number(redencionesResult.rows.find(r => r.estado === 'reclamado')?.total || 0);
      const expirados  = Number(redencionesResult.rows.find(r => r.estado === 'expirado')?.total  || 0);

      const totalOperativo = Number(row.cantidad_base) + Number(row.cantidad_extra);
      const reservasActivas = reservados + reclamados;
      const expiradosLiberados = Math.min(Number(row.cantidad_liberada), expirados);
      const expiradosPendientes = expirados - expiradosLiberados;
      const noUtilizada = Number(row.cantidad_no_utilizada || 0);

      const disponibles = totalOperativo - reservasActivas - expiradosPendientes - noUtilizada;
      const reutilizables = expiradosPendientes + noUtilizada;

      console.log(`\n    ── calculateDisponibilidad() SIMULADO ──`);
      console.log(`    totalOperativo:         ${totalOperativo}`);
      console.log(`    reservasActivas:        ${reservasActivas}  (reservados=${reservados} + reclamados=${reclamados})`);
      console.log(`    expirados:              ${expirados}`);
      console.log(`    expiradosLiberados:     ${expiradosLiberados}  (min(cantidad_liberada=${row.cantidad_liberada}, expirados=${expirados}))`);
      console.log(`    expiradosPendientes:    ${expiradosPendientes}  (expirados=${expirados} - liberados=${expiradosLiberados})`);
      console.log(`    noUtilizada:            ${noUtilizada}  (de bonos_diarios)`);
      console.log(`    ─────────────────────────────────`);
      console.log(`    disponibles = ${totalOperativo} - ${reservasActivas} - ${expiradosPendientes} - ${noUtilizada}`);
      console.log(`    disponibles = ${disponibles}  →  Math.max → ${Math.max(disponibles, 0)}`);
      console.log(`    reutilizables = ${expiradosPendientes} + ${noUtilizada} = ${reutilizables}`);

      // ──── SIMULAR calcularNoUtilizada ────
      const totalReservadosNoUtil = totalRedenciones; // COUNT(*) de todas las redenciones
      const noUtilizadaCalc = Math.max(0, totalOperativo - totalReservadosNoUtil);
      const past = isPastClosing(row.tipo);

      console.log(`\n    ── calcularNoUtilizada() SIMULADO ──`);
      console.log(`    isPastClosing:          ${past}`);
      console.log(`    totalOperativo:         ${totalOperativo}`);
      console.log(`    totalReservados(COUNT*): ${totalReservadosNoUtil}`);
      console.log(`    noUtilizada = MAX(0, ${totalOperativo} - ${totalReservadosNoUtil}) = ${noUtilizadaCalc}`);
      console.log(`    valor actual en DB:     ${row.cantidad_no_utilizada}`);
      console.log(`    ¿Cambiaría?:            ${Number(row.cantidad_no_utilizada) !== noUtilizadaCalc ? 'SÍ' : 'NO'}`);

      // ──── ANÁLISIS DE DOBLE RETENCIÓN ────
      console.log(`\n    ── ANÁLISIS DE DOBLE RETENCIÓN ──`);
      console.log(`    ¿expiradosPendientes (${expiradosPendientes}) + noUtilizada (${noUtilizada})`);
      console.log(`      retienen la misma capacidad?`);
      console.log(`    totalOperativo:              ${totalOperativo}`);
      console.log(`    Capacidad consumida real:    ${totalReservadosNoUtil} (todas las redenciones)`);
      console.log(`    Capacidad retenida:          ${expiradosPendientes + noUtilizada}`);
      console.log(`    Capacidad liberada:          ${expiradosLiberados}`);
      console.log(`    Balance: ${totalOperativo} - ${totalReservadosNoUtil} = ${totalOperativo - totalReservadosNoUtil}`);
      if (expiradosPendientes > 0 && noUtilizada > 0) {
        console.log(`    ⚠️  AMBOS > 0 — posible solapamiento (verificar abajo)`);
      }
      console.log(`    disponibles: ${Math.max(disponibles, 0)}`);
    }
  } catch (e) {
    console.log(`  Error consultando DB: ${e.message}`);
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Diagnóstico completo.');
  console.log('═══════════════════════════════════════════════');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
