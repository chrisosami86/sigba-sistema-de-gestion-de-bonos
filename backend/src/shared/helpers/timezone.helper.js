/**
 * SIGBA — Helper de zona horaria institucional
 *
 * Centraliza el tiempo operacional bajo America/Bogota.
 * process.env.TZ = 'America/Bogota' debe estar seteado en server.js
 * antes de que cualquier modulo use este helper.
 *
 * getBogotaDate() y formatBogotaDate() usan metodos locales (getFullYear,
 * getMonth, getDate) que respetan process.env.TZ, a diferencia de
 * toISOString() que siempre retorna UTC y puede desfasar la fecha
 * para horas Colombia posteriores a ~7 PM.
 */

const getBogotaNow = () => new Date();

const getBogotaDate = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getBogotaDateTime = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
};

const formatBogotaDate = (date) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return String(date).slice(0, 10);
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatBogotaDateTime = (date) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return String(date).slice(0, 19);
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
};

const parseDateParts = (dateStr) => {
  const match = String(dateStr).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Fecha invalida: ${dateStr}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
};

const formatDateParts = ({ year, month, day }) => {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const addDaysToDateString = (dateStr, days) => {
  const { year, month, day } = parseDateParts(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day + Number(days)));

  return formatDateParts({
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  });
};

const getDayNameFromDateString = (dateStr) => {
  const { year, month, day } = parseDateParts(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

  return days[utc.getUTCDay()];
};

const getCurrentBogotaMinutes = () => {
  const now = getBogotaNow();
  return now.getHours() * 60 + now.getMinutes();
};

const getWeekStartDate = (dateStr) => {
  const { year, month, day } = parseDateParts(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dow = utc.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;

  return addDaysToDateString(dateStr, offset);
};

module.exports = {
  getBogotaNow,
  getBogotaDate,
  getBogotaDateTime,
  formatBogotaDate,
  formatBogotaDateTime,
  addDaysToDateString,
  getDayNameFromDateString,
  getCurrentBogotaMinutes,
  getWeekStartDate,
};
