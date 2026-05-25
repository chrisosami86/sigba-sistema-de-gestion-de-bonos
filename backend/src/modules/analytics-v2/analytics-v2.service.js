/**
 * SIGBA — Analytics V2: Servicio Orquestador + Alertas
 *
 * Solo lectura. Coordina los 5 servicios de dominio.
 * NO modifica operación. NO llama expireBonos().
 */

const pool = require("../../config/db");
const { getOperationalSnapshot } = require("./services/operational-analytics.service");
const { getSubsidyAnalytics } = require("./services/subsidy-analytics.service");
const { getProviderAnalytics } = require("./services/provider-analytics.service");
const { getAdministrativeAnalytics } = require("./services/administrative-analytics.service");
const { getHistoricalAnalytics } = require("./services/historical-analytics.service");

const getDashboard = async (query = {}) => {
  const {
    fechaInicio,
    fechaFin,
    fechaSnapshot,
  } = query;

  const today = new Date().toISOString().slice(0, 10);
  const inicio = fechaInicio || today;
  const fin = fechaFin || today;
  const snapshotDate = fechaSnapshot || today;

  const [
    operational,
    subsidy,
    provider,
    administrative,
    historical,
  ] = await Promise.all([
    getOperationalSnapshot(snapshotDate),
    getSubsidyAnalytics(inicio, fin),
    getProviderAnalytics(inicio, fin),
    getAdministrativeAnalytics(inicio, fin),
    getHistoricalAnalytics(inicio, fin),
  ]);

  const alertas = await computeAlerts(operational, subsidy, provider, administrative, historical);

  return {
    timestamp: new Date().toISOString(),
    fechaInicio: inicio,
    fechaFin: fin,
    operational,
    subsidy,
    provider,
    administrative,
    historical,
    alertas,
  };
};

const computeAlerts = async (operational, subsidy, provider, administrative, historical) => {
  const alerts = [];

  const settings = await pool.query("SELECT fecha_fin FROM system_settings WHERE id = 1");
  const fechaFin = settings.rows[0]?.fecha_fin;
  if (fechaFin) {
    const fin = new Date(fechaFin);
    const today = new Date();
    const daysLeft = Math.ceil((fin - today) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7 && daysLeft >= 0) {
      alerts.push({
        tipo: "PERIODO_POR_FINALIZAR",
        mensaje: `El periodo academico finaliza en ${daysLeft} dia(s) (${fechaFin instanceof Date ? fechaFin.toISOString().slice(0, 10) : String(fechaFin).slice(0, 10)}).`,
        severidad: daysLeft <= 1 ? "ALTA" : "MEDIA",
      });
    }
  }

  const bestSubsidyDay = subsidy.byDay?.find(d => d.porcentajeInasistencia > 0);
  if (bestSubsidyDay) {
    const worst = bestSubsidyDay.porcentajeInasistencia;
    if (worst >= 50) {
      alerts.push({
        tipo: "ALTA_INASISTENCIA",
        mensaje: `Inasistencia subsidiada del ${worst}% en dia ${bestSubsidyDay.dia}.`,
        severidad: worst >= 70 ? "ALTA" : "MEDIA",
      });
    }

    const criticalCount = bestSubsidyDay.estudiantesCriticos?.filter(s => s.porcentajeInasistencia >= 70).length || 0;
    if (criticalCount > 0) {
      alerts.push({
        tipo: "ESTUDIANTES_CRITICOS",
        mensaje: `${criticalCount} estudiante(s) con inasistencia >= 70% en subsidio (${bestSubsidyDay.dia}).`,
        severidad: "MEDIA",
      });
    }
  }

  if (provider.pendientes > 0 || provider.diferenciaCritica > 0) {
    alerts.push({
      tipo: "CONCILIACIONES_PENDIENTES",
      mensaje: `${provider.pendientes} conciliacion(es) pendientes, ${provider.diferenciaCritica} critica(s).`,
      severidad: provider.diferenciaCritica > 0 ? "ALTA" : "MEDIA",
    });
  }

  return alerts;
};

module.exports = { getDashboard };
