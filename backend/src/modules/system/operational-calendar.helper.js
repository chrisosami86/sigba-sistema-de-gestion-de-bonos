const pool = require("../../config/db");
const {
  formatBogotaDate,
  getDayNameFromDateString,
  getBogotaNow,
} = require("../../shared/helpers/timezone.helper");

const DIAS_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

const normalizeDia = (dia) => {
  return String(dia)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const isAcademicPeriodActive = async (date = getBogotaNow()) => {
  const dateStr = formatBogotaDate(date);
  const result = await pool.query(
    `SELECT ($1::date BETWEEN fecha_inicio AND fecha_fin) AS active
     FROM system_settings
     WHERE id = 1
       AND fecha_inicio IS NOT NULL
       AND fecha_fin IS NOT NULL`,
    [dateStr]
  );

  return Boolean(result.rows[0]?.active);
};

const isOperationalDay = async (date = getBogotaNow()) => {
  const periodActive = await isAcademicPeriodActive(date);
  if (!periodActive) {
    return { isOperational: false, reason: "PERIODO_CERRADO" };
  }

  const dateStr = formatBogotaDate(date);
  const diaSemana = getDayNameFromDateString(dateStr);

  const workingResult = await pool.query(
    "SELECT activo FROM working_days WHERE dia = $1",
    [diaSemana]
  );

  if (workingResult.rows.length === 0 || !workingResult.rows[0].activo) {
    return { isOperational: false, reason: "DIA_NO_HABIL" };
  }

  const holidayResult = await pool.query(
    "SELECT id FROM holidays WHERE fecha = $1::date",
    [dateStr]
  );

  if (holidayResult.rows.length > 0) {
    return { isOperational: false, reason: "FESTIVO" };
  }

  return { isOperational: true, reason: null };
};

const canOperateToday = async (date = getBogotaNow()) => {
  const periodActive = await isAcademicPeriodActive(date);
  if (!periodActive) {
    return { allowed: false, reason: "PERIODO_CERRADO" };
  }

  const operationalDay = await isOperationalDay(date);
  if (!operationalDay.isOperational) {
    return { allowed: false, reason: operationalDay.reason };
  }

  return { allowed: true, reason: null };
};

const isPastPeriodEnd = async (date = getBogotaNow()) => {
  const dateStr = formatBogotaDate(date);
  const result = await pool.query(
    `SELECT ($1::date > fecha_fin) AS past
     FROM system_settings
     WHERE id = 1
       AND fecha_fin IS NOT NULL`,
    [dateStr]
  );

  return Boolean(result.rows[0]?.past);
};

const requireOperationalDay = async (req, res, next) => {
  try {
    const operational = await canOperateToday();

    if (!operational.allowed) {
      return res.status(403).json({
        message: "Operacion no permitida",
        reason: operational.reason,
      });
    }

    next();
  } catch (err) {
    console.error("[requireOperationalDay]", err.message);
    return res.status(500).json({ message: "Error validando estado operacional" });
  }
};

const requireActivePeriod = async (req, res, next) => {
  try {
    const isHistorical = await isPastPeriodEnd();

    if (isHistorical) {
      return res.status(403).json({
        message: "Periodo academico cerrado. SIGBA se encuentra en modo historico.",
        reason: "PERIODO_CERRADO",
      });
    }

    next();
  } catch (err) {
    console.error("[requireActivePeriod]", err.message);
    return res.status(500).json({ message: "Error validando periodo academico" });
  }
};

module.exports = {
  isAcademicPeriodActive,
  isOperationalDay,
  canOperateToday,
  isPastPeriodEnd,
  requireOperationalDay,
  requireActivePeriod,
};
