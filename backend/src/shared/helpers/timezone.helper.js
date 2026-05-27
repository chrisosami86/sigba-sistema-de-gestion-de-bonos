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

module.exports = {
  getBogotaNow,
  getBogotaDate,
  getBogotaDateTime,
  formatBogotaDate,
  formatBogotaDateTime,
};
