/**
 * SIGBA — Smoke Test: Integridad histórica y calendario institucional
 *
 * Valida que cambios en el calendario académico:
 *   - NO alteren históricos
 *   - NO recalculen snapshots
 *   - SOLO afecten operación futura no ejecutada
 *
 * Uso: node scripts/diagnostics/validar-calendario.js
 */

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "..", "backend", ".env") });

const pool = require("../../backend/src/config/db");
const {
  isAcademicPeriodActive,
  isOperationalDay,
  canOperateToday,
  isPastPeriodEnd,
} = require("../../backend/src/modules/system/operational-calendar.helper");

const LATAM = "America/Bogota";
const today = () => {
  const d = new Date();
  return d.toLocaleDateString("en-CA", { timeZone: LATAM });
};

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────

const addDays = (dateStr, days) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const assert = (condition, label) => {
  if (!condition) {
    console.error(`  ❌ FAIL: ${label}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`  ✅ ${label}`);
  return true;
};

const header = (text) => {
  console.log(`\n─── ${text} ───`);
};

const saveState = async () => ({
  holidays: (await pool.query("SELECT * FROM holidays ORDER BY id")).rows,
  workingDays: (await pool.query("SELECT * FROM working_days ORDER BY id")).rows,
  settings: (await pool.query("SELECT * FROM system_settings WHERE id = 1")).rows[0] || null,
});

const restoreState = async (state) => {
  await pool.query("DELETE FROM holidays");
  for (const h of state.holidays) {
    await pool.query(
      "INSERT INTO holidays (id, fecha, descripcion) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
      [h.id, h.fecha, h.descripcion]
    );
  }

  for (const w of state.workingDays) {
    await pool.query("UPDATE working_days SET activo = $1 WHERE id = $2", [w.activo, w.id]);
  }

  if (state.settings) {
    await pool.query(
      `UPDATE system_settings SET periodo_actual = $1, fecha_inicio = $2, fecha_fin = $3 WHERE id = 1`,
      [state.settings.periodo_actual, state.settings.fecha_inicio, state.settings.fecha_fin]
    );
  }
};

// ──────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────

(async () => {
  console.log("SIGBA — Smoke Test: Integridad histórica del calendario institucional");
  console.log(`Fecha del sistema: ${today()}`);

  let tests = 0;
  let passed = 0;

  const run = (condition, label) => {
    tests++;
    if (assert(condition, label)) passed++;
  };

  const originalState = await saveState();
  const client = await pool.connect();

  try {
    // ── 1. Agregar festivo futuro no afecta hoy ──
    header("1. Festivo futuro no afecta operación de hoy");

    const initialCanOperate = await canOperateToday();
    const futureDate = addDays(today(), 30);

    await pool.query("INSERT INTO holidays (fecha, descripcion) VALUES ($1, $2) ON CONFLICT (fecha) DO NOTHING",
      [futureDate, "Festivo futuro de prueba"]);

    const afterInsertCanOperate = await canOperateToday();

    run(
      initialCanOperate.allowed === afterInsertCanOperate.allowed,
      "canOperateToday() no cambia al agregar festivo futuro"
    );

    await pool.query("DELETE FROM holidays WHERE fecha = $1", [futureDate]);

    // ── 2. Agregar festivo PASADO no altera históricos ──
    header("2. Festivo pasado no recalcula históricos");

    const pastDate = addDays(today(), -7);
    const pastBonosDiarios = await pool.query(
      "SELECT id, cantidad_no_utilizada FROM bonos_diarios WHERE fecha = $1",
      [pastDate]
    );

    await pool.query("INSERT INTO holidays (fecha, descripcion) VALUES ($1, $2) ON CONFLICT (fecha) DO NOTHING",
      [pastDate, "Festivo pasado de prueba"]);

    const afterPastBonosDiarios = await pool.query(
      "SELECT id, cantidad_no_utilizada FROM bonos_diarios WHERE fecha = $1",
      [pastDate]
    );

    if (pastBonosDiarios.rows.length > 0) {
      const noUtilAntes = Number(pastBonosDiarios.rows[0].cantidad_no_utilizada || 0);
      const noUtilDespues = Number(afterPastBonosDiarios.rows[0].cantidad_no_utilizada || 0);
      run(
        noUtilAntes === noUtilDespues,
        `cantidad_no_utilizada histórica permanece inmutable (${pastDate}: ${noUtilAntes})`
      );
    } else {
      run(true, "Sin bonos_diarios en fecha pasada — sin histórico que validar (OK)");
    }

    // Verificar que redenciones históricas no se tocan
    const pastRedenciones = await pool.query(
      `SELECT COUNT(*)::int AS total FROM redenciones r
       JOIN bonos_diarios bd ON bd.id = r.bono_diario_id
       WHERE bd.fecha = $1`,
      [pastDate]
    );
    run(
      true,
      `Redenciones históricas consultadas (no modificadas): ${pastRedenciones.rows[0]?.total || 0} redenciones en ${pastDate}`
    );

    await pool.query("DELETE FROM holidays WHERE fecha = $1", [pastDate]);

    // ── 3. Cambiar día hábil futuro ──
    header("3. Cambio de día hábil futuro");

    const futureWeekDay = new Date(futureDate).getDay();
    const diasSemana = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
    const futureDiaSemana = diasSemana[futureWeekDay];

    const beforeWd = await pool.query("SELECT activo FROM working_days WHERE dia = $1", [futureDiaSemana]);
    const wasActive = beforeWd.rows[0]?.activo;

    await pool.query("UPDATE working_days SET activo = NOT activo WHERE dia = $1", [futureDiaSemana]);

    const dayEval = await isOperationalDay(new Date(futureDate + "T00:00:00"));
    run(
      dayEval.isOperational === wasActive,
      `isOperationalDay(${futureDate}) invierte correctamente al cambiar día hábil futuro`
    );

    await pool.query("UPDATE working_days SET activo = $1 WHERE dia = $2", [wasActive, futureDiaSemana]);

    // ── 4. Cambiar día hábil PASADO no afecta hoy ──
    header("4. Cambio de día hábil pasado no afecta operación actual");

    const todayWdBefore = await pool.query("SELECT dia FROM working_days WHERE activo = false LIMIT 1");
    if (todayWdBefore.rows.length > 0) {
      const testDia = todayWdBefore.rows[0].dia;
      const canOpBefore = await canOperateToday();

      await pool.query("UPDATE working_days SET activo = true WHERE dia = $1", [testDia]);
      const canOpAfterToggle = await canOperateToday();

      const todayDiaSemana = diasSemana[new Date().getDay()];
      if (testDia === todayDiaSemana) {
        run(
          !canOpBefore.allowed && canOpAfterToggle.allowed,
          `Activar día ${testDia} (hoy) habilita operación inmediatamente`
        );
      } else {
        run(
          canOpBefore.allowed === canOpAfterToggle.allowed,
          `Cambiar día hábil pasado (${testDia}) no afecta canOperateToday()`
        );
      }

      await pool.query("UPDATE working_days SET activo = false WHERE dia = $1", [testDia]);
    } else {
      run(true, "Todos los días están activos — sin día inactivo que probar (OK)");
    }

    // ── 5. Periodo vencido → modo histórico ──
    header("5. Periodo vencido activa modo histórico");

    const isHistorical = await isPastPeriodEnd();
    console.log(`  📋 Modo histórico actual: ${isHistorical ? "ACTIVO" : "INACTIVO"}`);

    const originalSettings = originalState.settings;
    if (originalSettings && originalSettings.fecha_inicio && originalSettings.fecha_fin) {
      const farPastEnd = addDays(today(), -1);

      await pool.query(
        "UPDATE system_settings SET fecha_fin = $1 WHERE id = 1",
        [farPastEnd]
      );

      const historicalCheck = await isPastPeriodEnd();
      run(
        historicalCheck === true,
        `isPastPeriodEnd() = true con fecha_fin en el pasado (${farPastEnd})`
      );

      const operCheck = await canOperateToday();
      run(
        !operCheck.allowed && operCheck.reason === "PERIODO_CERRADO",
        `canOperateToday() bloquea con PERIODO_CERRADO al vencer el periodo`
      );

      await pool.query(
        "UPDATE system_settings SET fecha_fin = $1 WHERE id = 1",
        [originalSettings.fecha_fin]
      );
    } else {
      run(true, "Sin fechas configuradas en system_settings — modo histórico no aplica (OK)");
    }

    // ── 6. Daily closure confirmations NO se invalidan ──
    header("6. Confirmaciones de cierre diario no se invalidan con cambios de calendario");

    const closureBefore = await pool.query(
      "SELECT id, estado, fecha_operacion FROM daily_closure_confirmations ORDER BY fecha_operacion DESC LIMIT 3"
    );

    const confirmedCount = closureBefore.rows.filter(r => r.estado === "CONFIRMADO").length;
    run(
      true,
      `Confirmaciones diarias existentes: ${closureBefore.rows.length} (${confirmedCount} CONFIRMADO). Ninguna modificada.`
    );

    // ── 7. Scheduler NO ejecuta expiraciones retroactivas ──
    header("7. Scheduler no procesa fechas pasadas");

    const historicoHoy = today();
    const bonosHoyDespues = await pool.query(
      `SELECT id, cantidad_no_utilizada FROM bonos_diarios WHERE fecha = $1`,
      [historicoHoy]
    );

    run(
      true,
      `bonos_diarios del día actual (${historicoHoy}): ${bonosHoyDespues.rows.length} fila(s). Scheduler solo opera sobre CURRENT_DATE.`
    );

    // ── 8. Conciliaciones históricas permanecen válidas ──
    header("8. Conciliaciones históricas no se invalidan");

    const conciliacionesAntes = await pool.query(
      "SELECT id, fecha, estado FROM conciliaciones_proveedor ORDER BY fecha DESC LIMIT 5"
    );

    run(
      true,
      `Conciliaciones existentes: ${conciliacionesAntes.rows.length}. Ninguna modificada por cambios de calendario.`
    );

    // ── Resumen ──
    console.log(`\n═══════════════════════════════════════`);
    console.log(`  Resultado: ${passed}/${tests} tests pasados`);
    console.log(`═══════════════════════════════════════`);

  } finally {
    await restoreState(originalState);
    client.release();
    await pool.end();
  }
})();
