const pool = require("../../config/db");
const {
  formatBogotaDate,
  getDayNameFromDateString,
  getBogotaNow,
} = require("./timezone.helper");

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

const isWorkingDay = async (date = getBogotaNow()) => {
  const dateStr = formatBogotaDate(date);
  const diaSemana = getDayNameFromDateString(dateStr);

  const workingResult = await pool.query(
    "SELECT activo FROM working_days WHERE dia = $1",
    [diaSemana],
  );

  if (workingResult.rows.length === 0 || !workingResult.rows[0].activo) {
    return { isWorking: false, reason: `El dia ${diaSemana} no es un dia habil` };
  }

  const holidayResult = await pool.query(
    "SELECT id FROM holidays WHERE fecha = $1::date",
    [dateStr],
  );

  if (holidayResult.rows.length > 0) {
    return { isWorking: false, reason: "Hoy es un dia festivo" };
  }

  return { isWorking: true, reason: null };
};

module.exports = {
  isWorkingDay,
};
