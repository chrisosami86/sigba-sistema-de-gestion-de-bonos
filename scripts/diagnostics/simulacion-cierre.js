// SIGBA — Simulación completa de cierre operacional
// Ejecutar: node scripts/simulacion-cierre.js
require('../../backend/node_modules/dotenv').config({ path: require('path').join(__dirname, '../..', 'backend', '.env') });
process.env.TZ = 'America/Bogota';

const pool = require('../../backend/src/config/db');

const HORARIOS = {
  almuerzo: {
    subsidiado:    { expiracion: { hours: 11, minutes: 0 } },
    ventaLibre:    { expiracion: { hours: 12, minutes: 5 } },
  },
  refrigerio: {
    subsidiado:    { expiracion: { hours: 21, minutes: 30 } },
    ventaLibre:    { expiracion: { hours: 22, minutes: 0 } },
  },
};

const isPastClosing = (tipo) => {
  const closing = new Date();
  closing.setHours(HORARIOS[tipo].ventaLibre.expiracion.hours, HORARIOS[tipo].ventaLibre.expiracion.minutes, 0, 0);
  return new Date() >= closing;
};

// ============================================================
// FÓRMULAS EXACTAS (replicadas del código fuente)
// ============================================================

function calculateDisponibilidad(bonoDiario, redenciones) {
  const reservados = redenciones.reservados;
  const reclamados = redenciones.reclamados;
  const expirados  = redenciones.expirados;

  const expiradosLiberados = Math.min(Number(bonoDiario.cantidad_liberada), expirados);
  const expiradosPendientes = expirados - expiradosLiberados;
  const noUtilizada = Number(bonoDiario.cantidad_no_utilizada || 0);

  const totalOperativo = Number(bonoDiario.cantidad_base) + Number(bonoDiario.cantidad_extra);
  const reservasActivas = reservados + reclamados;
  const disponibles = totalOperativo - reservasActivas - expiradosPendientes - noUtilizada;

  return {
    totalOperativo, reservasActivas, reservados, reclamados, expirados,
    expiradosLiberados, expiradosPendientes, noUtilizada,
    disponibles: Math.max(disponibles, 0),
    reutilizables: expiradosPendientes + noUtilizada,
  };
}

function calcularNoUtilizada(totalOperativo, totalRedenciones) {
  return Math.max(0, totalOperativo - totalRedenciones);
}

// ============================================================
// ESCENARIOS DE PRUEBA
// ============================================================

const escenarios = [
  {
    nombre: "A: OPERACIÓN VIVA — subsidio activo, todo disponible",
    config: {
      totalOperativo: 150,
      reservados: 10, reclamados: 0, expirados: 0,
      cantidad_liberada: 0, cantidad_no_utilizada: 0,
      pastClosing: false,
    },
  },
  {
    nombre: "B: CIERRE TOTAL — todos reclamados, nada expirado, nada sin usar",
    config: {
      totalOperativo: 150,
      reservados: 0, reclamados: 150, expirados: 0,
      cantidad_liberada: 0, cantidad_no_utilizada: 0,
      pastClosing: true,
    },
  },
  {
    nombre: "C: CIERRE CON EXPIRADOS — 140 reclamados, 10 expirados",
    config: {
      totalOperativo: 150,
      reservados: 0, reclamados: 140, expirados: 10,
      cantidad_liberada: 0, cantidad_no_utilizada: 0,
      pastClosing: true,
    },
  },
  {
    nombre: "D: CIERRE CON EXPIRADOS + noUtilizada correcta",
    config: {
      totalOperativo: 150,
      reservados: 0, reclamados: 120, expirados: 10,
      cantidad_liberada: 0, cantidad_no_utilizada: 20,
      pastClosing: true,
    },
  },
  {
    nombre: "E: CIERRE CON EXPIRADOS + LIBERADOS + noUtilizada correcta",
    config: {
      totalOperativo: 150,
      reservados: 0, reclamados: 110, expirados: 15,
      cantidad_liberada: 10, cantidad_no_utilizada: 25,
      pastClosing: true,
    },
  },
  {
    nombre: "F: CIERRE SIN EXPIRADOS (todo no utilizado excepto pocos reclamados)",
    config: {
      totalOperativo: 110,
      reservados: 0, reclamados: 2, expirados: 0,
      cantidad_liberada: 0, cantidad_no_utilizada: 0,
      pastClosing: true,
    },
  },
  {
    nombre: "G: BUG REPRODUCIDO — Escenario F con noUtilizada CORRECTA (108)",
    config: {
      totalOperativo: 110,
      reservados: 0, reclamados: 2, expirados: 0,
      cantidad_liberada: 0, cantidad_no_utilizada: 108,
      pastClosing: true,
    },
  },
];

// ============================================================
// ANÁLISIS MATEMÁTICO: ¿Doble retención?
// ============================================================

function analizarDobleRetencion(totOp, res, rec, exp, lib, noUtil) {
  // Álgebra simbólica
  const countAll = res + rec + exp;
  const noUtilFormula = Math.max(0, totOp - countAll);
  const expPen = exp - Math.min(lib, exp);
  const disp = Math.max(0, totOp - (res + rec) - expPen - noUtil);

  // Análisis: ¿expirados aparece en ambos términos?
  // expiradosPendientes = exp - MIN(lib, exp)
  // noUtilizada        = MAX(0, totOp - (res+rec+exp))
  //
  // Si noUtilizada > 0:
  //   noUtilizada = totOp - res - rec - exp
  //   expiradosPendientes = exp - lib (si lib <= exp)
  //
  //   disponibles = totOp - res - rec - (exp - lib) - (totOp - res - rec - exp)
  //               = totOp - res - rec - exp + lib - totOp + res + rec + exp
  //               = lib
  //
  // Si noUtilizada == 0:
  //   disponibles = totOp - res - rec - (exp - lib) - 0
  //               = totOp - res - rec - exp + lib
  //               = totOp - countAll + lib
  //
  // Conclusión: expirados se cancela cuando noUtilizada > 0.
  // No hay doble retención, pero la fórmula es algebraicamente redundante.

  const hayDobleRetencion = (expPen > 0 && noUtil > 0) &&
    (totOp - res - rec - expPen - noUtil < 0 && Math.max(0, totOp - res - rec - expPen - noUtil) === 0);

  return {
    countAll,
    noUtilFormula,
    expPen,
    dispFormula: Math.max(0, totOp - (res + rec) - expPen - noUtilFormula),
    dispActual: disp,
    noUtilCoincide: noUtil === noUtilFormula,
    algebraReducida: noUtilFormula > 0
      ? `disponibles = liberados = ${lib}`
      : `disponibles = max(0, totalOperativo - countAll + liberados) = ${Math.max(0, totOp - countAll + lib)}`,
    hayDobleRetencion,
  };
}

// ============================================================
// EJECUCIÓN
// ============================================================

console.log('═══════════════════════════════════════════════════════════════');
console.log('  SIGBA — Simulación Completa de Cierre Operacional');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('─── DATOS DE ENTRADA ───');
console.log(`  Hora actual Node.js:      ${new Date().toISOString()}`);
console.log(`  isPastClosing(almuerzo):  ${isPastClosing('almuerzo')}`);
console.log(`  isPastClosing(refrigerio): ${isPastClosing('refrigerio')}\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PARTE 1: Escenarios de calculateDisponibilidad()');
console.log('═══════════════════════════════════════════════════════════════\n');

for (const esc of escenarios) {
  const c = esc.config;
  const bonoDiario = {
    cantidad_base: c.totalOperativo,
    cantidad_extra: 0,
    cantidad_liberada: c.cantidad_liberada,
    cantidad_no_utilizada: c.cantidad_no_utilizada,
  };
  const redenciones = {
    reservados: c.reservados,
    reclamados: c.reclamados,
    expirados: c.expirados,
  };

  const result = calculateDisponibilidad(bonoDiario, redenciones);
  const countAll = c.reservados + c.reclamados + c.expirados;
  const noUtilCalc = calcularNoUtilizada(c.totalOperativo, countAll);

  console.log(`  ── ${esc.nombre} ──`);
  console.log(`  Config:           totOp=${c.totalOperativo} res=${c.reservados} rec=${c.reclamados} exp=${c.expirados} lib=${c.cantidad_liberada} noUtilDB=${c.cantidad_no_utilizada}`);
  console.log(`  countAll:         ${countAll}`);
  console.log(`  noUtilCalculada:  ${noUtilCalc}  (¿coincide con DB? ${noUtilCalc === c.cantidad_no_utilizada ? 'SÍ' : 'NO ⚠️'})`);
  console.log(`  ─────────────────────────────`);
  console.log(`  totalOperativo:       ${result.totalOperativo}`);
  console.log(`  reservasActivas:      ${result.reservasActivas}  (r=${result.reservados} + c=${result.reclamados})`);
  console.log(`  expirados:            ${result.expirados}`);
  console.log(`  expiradosLiberados:   ${result.expiradosLiberados}`);
  console.log(`  expiradosPendientes:  ${result.expiradosPendientes}  (exp − lib)`);
  console.log(`  noUtilizada (DB):     ${result.noUtilizada}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  disponibles           = ${c.totalOperativo} - ${result.reservasActivas} - ${result.expiradosPendientes} - ${result.noUtilizada}`);
  console.log(`  disponibles           = ${result.disponibles}`);
  console.log(`  reutilizables         = ${result.reutilizables}`);

  const analisis = analizarDobleRetencion(
    c.totalOperativo, c.reservados, c.reclamados, c.expirados,
    c.cantidad_liberada, c.cantidad_no_utilizada
  );
  console.log(`  ── Análisis matemático ──`);
  console.log(`  Álgebra reducida:   ${analisis.algebraReducida}`);
  console.log(`  ¿noUtilizada coincide con fórmula? ${analisis.noUtilCoincide ? 'SÍ' : 'NO ⚠️ — inconsistencia detectada'}`);
  if (analisis.hayDobleRetencion) {
    console.log(`  ⚠️  DOBLE RETENCIÓN DETECTADA`);
  }
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PARTE 2: Análisis de Doble Retención (expiradosPendientes vs noUtilizada)');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('  Fórmula oficial:');
console.log('    disponibles = totalOperativo - reservasActivas - expiradosPendientes - noUtilizada\n');
console.log('  Donde:');
console.log('    reservasActivas    = reservados + reclamados');
console.log('    expiradosPendientes = expirados - MIN(liberados, expirados)');
console.log('    noUtilizada         = MAX(0, totalOperativo - (reservados + reclamados + expirados))\n');
console.log('  Sustituyendo noUtilizada cuando > 0:');
console.log('    noUtilizada = totalOperativo - reservados - reclamados - expirados');
console.log('    disponibles = totalOperativo - reservados - reclamados - (expirados - liberados)');
console.log('                  - (totalOperativo - reservados - reclamados - expirados)');
console.log('                = totalOperativo - reservados - reclamados - expirados + liberados');
console.log('                  - totalOperativo + reservados + reclamados + expirados');
console.log('                = liberados\n');
console.log('  CONCLUSIÓN MATEMÁTICA:');
console.log('  ┌─────────────────────────────────────────────────────────────┐');
console.log('  │ Cuando noUtilizada > 0:  disponibles = cantidad_liberada   │');
console.log('  │ Cuando noUtilizada = 0:  disponibles = max(0, totOp -      │');
console.log('  │                          countAll + liberados)              │');
console.log('  └─────────────────────────────────────────────────────────────┘\n');
console.log('  ¿Existe DOBLE RETENCIÓN?:');
console.log('  Los expirados aparecen en los DOS términos que se restan:');
console.log('    - En expiradosPendientes: -expirados');
console.log('    - En noUtilizada (implícito): ... +expirados  (por el signo negativo de noUtilizada)');
console.log('  Pero el álgebra los CANCELA exactamente.');
console.log('  NO hay doble retención real — es redundancia algebraica que se autocompensa.\n');
console.log('  Sin embargo, si cantidad_no_utilizada está DESINCRONIZADA (≠ fórmula),');
console.log('  la cancelación NO ocurre → disponibilidad incorrecta.');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PARTE 3: Diagrama de Desincronización (BUG raíz)');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('  getDisponibilidad(tipo):');
console.log('  ┌─────────────────────────────────────────────────────────┐');
console.log('  │ 1. expireBonos()                                        │');
console.log('  │    └─ calcularNoUtilizada()                             │');
console.log('  │       └─ cerrarOperacionDiariaInterna()                 │');
console.log('  │          └─ SELECT bonos_diarios WHERE fecha=CURRENT_DATE');
console.log('  │             → NO EXISTE (primer llamado del día)        │');
console.log('  │             → RETURN (no actualiza nada)  ◄── BUG      │');
console.log('  │                                                         │');
console.log('  │ 2. getOrCreateBonoDiario()                              │');
console.log('  │    └─ INSERT bonos_diarios (cantidad_no_utilizada=0)    │');
console.log('  │       → fila creada con DEFAULT 0                       │');
console.log('  │                                                         │');
console.log('  │ 3. calculateDisponibilidad()                            │');
console.log('  │    └─ lee cantidad_no_utilizada = 0                     │');
console.log('  │       → disponibles = totalOperativo - reservasActivas  │');
console.log('  │       → disponibles MUESTRA CAPACIDAD FANTASMA          │');
console.log('  └─────────────────────────────────────────────────────────┘\n');
console.log('  CONSECUENCIA VISUAL:');
console.log('    El dashboard muestra "disponibles: 108" cuando en realidad');
console.log('    debería mostrar "disponibles: 0" (todo lo no consumido es noUtilizada).\n');
console.log('  SOLUCIÓN MÍNIMA (sin refactor):');
console.log('    Invertir orden en getDisponibilidad:');
console.log('    1. getOrCreateBonoDiario()  ← PRIMERO');
console.log('    2. expireBonos()            ← DESPUÉS (ya existe la fila)');
console.log('    3. calculateDisponibilidad()');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PARTE 4: Verificación con DB real');
console.log('═══════════════════════════════════════════════════════════════\n');

(async () => {
  try {
    const diarioResult = await pool.query(`
      SELECT bd.id, bd.fecha, cb.tipo,
             bd.cantidad_base, bd.cantidad_extra,
             bd.cantidad_liberada, bd.cantidad_no_utilizada
      FROM bonos_diarios bd
      JOIN config_bonos cb ON cb.id = bd.config_bono_id
      WHERE bd.fecha = CURRENT_DATE
      ORDER BY cb.tipo
    `);

    if (diarioResult.rows.length === 0) {
      console.log('  (No hay bonos_diarios para hoy — DB vacía o sin registros)');
    }

    for (const row of diarioResult.rows) {
      const redencionesResult = await pool.query(`
        SELECT estado, COUNT(*)::int AS total
        FROM redenciones
        WHERE bono_diario_id = $1
        GROUP BY estado
      `, [row.id]);

      const res = Number(redencionesResult.rows.find(r => r.estado === 'reservado')?.total || 0);
      const rec = Number(redencionesResult.rows.find(r => r.estado === 'reclamado')?.total || 0);
      const exp = Number(redencionesResult.rows.find(r => r.estado === 'expirado')?.total  || 0);
      const countAll = res + rec + exp;
      const totOp = Number(row.cantidad_base) + Number(row.cantidad_extra);
      const lib = Number(row.cantidad_liberada);
      const noUtilDB = Number(row.cantidad_no_utilizada || 0);
      const noUtilCalc = calcularNoUtilizada(totOp, countAll);

      const bonoDiario = {
        cantidad_base: row.cantidad_base,
        cantidad_extra: row.cantidad_extra,
        cantidad_liberada: row.cantidad_liberada,
        cantidad_no_utilizada: row.cantidad_no_utilizada,
      };
      const redenciones = { reservados: res, reclamados: rec, expirados: exp };
      const disp = calculateDisponibilidad(bonoDiario, redenciones);

      console.log(`\n  ── ${row.tipo.toUpperCase()} (id=${row.id}, fecha=${row.fecha}) ──`);
      console.log(`  Redenciones reales:  res=${res}  rec=${rec}  exp=${exp}  TOTAL=${countAll}`);
      console.log(`  totOp=${totOp}  lib=${lib}  noUtilDB=${noUtilDB}  noUtilCalc=${noUtilCalc}`);
      console.log(`  ¿noUtilizada sincronizada? ${noUtilDB === noUtilCalc ? 'SÍ ✅' : 'NO ⚠️  (diff=' + (noUtilCalc - noUtilDB) + ')'}`);
      console.log(`  disponibles real:    ${disp.disponibles}`);
      console.log(`  disponibles esperado: ${Math.max(0, noUtilCalc > 0 ? lib : totOp - countAll + lib)}`);
      if (noUtilDB !== noUtilCalc) {
        console.log(`  ⚠️  DESINCRONIZACIÓN DETECTADA: noUtilizada DB=${noUtilDB} vs fórmula=${noUtilCalc}`);
        console.log(`  ⚠️  Causa: expireBonos() se ejecutó ANTES de que existiera el bonos_diarios de hoy`);
        console.log(`  ⚠️  Impacto: dashboard muestra ${disp.disponibles} disponibles FANTASMA (deberían ser ${Math.max(0, noUtilCalc > 0 ? lib : totOp - countAll + lib)})`);
      }
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Simulación completa.');
  console.log('═══════════════════════════════════════════════════════════════');

  await pool.end();
})();
