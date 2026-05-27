const systemService = require("./system.service");
const { getStatus: getSchedulerStatus } = require("./scheduler");
const { canOperateToday, isPastPeriodEnd } = require("./operational-calendar.helper");
const pool = require("../../config/db");
const { getBogotaDateTime } = require("../../shared/helpers/timezone.helper");

const getServerTime = async (req, res) => {
  try {
    const serverTime = await systemService.getServerTime();
    res.json(serverTime);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error obteniendo hora" });
  }
};

const getHealth = async (req, res) => {
  try {
    const uptime = Math.floor(process.uptime());
    let dbStatus = "ok";
    try {
      await pool.query("SELECT 1");
    } catch {
      dbStatus = "error";
    }

    res.json({
      status: "ok",
      uptime,
      db: dbStatus,
      scheduler: getSchedulerStatus(),
      timestamp: getBogotaDateTime(),
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};

// ── System Settings ──

const getSystemSettings = async (req, res) => {
  try {
    const settings = await systemService.getSystemSettings();
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error obteniendo configuracion del sistema" });
  }
};

const updateSystemSettings = async (req, res) => {
  try {
    const settings = await systemService.updateSystemSettings(req.body);
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error actualizando configuracion del sistema" });
  }
};

// ── Working Days ──

const getWorkingDays = async (req, res) => {
  try {
    const days = await systemService.getWorkingDays();
    res.json(days);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error obteniendo dias habiles" });
  }
};

const updateWorkingDays = async (req, res) => {
  try {
    const days = await systemService.updateWorkingDays(req.body.days);
    res.json(days);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error actualizando dias habiles" });
  }
};

// ── Holidays ──

const getHolidays = async (req, res) => {
  try {
    const holidays = await systemService.getHolidays();
    res.json(holidays);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error obteniendo festivos" });
  }
};

const createHoliday = async (req, res) => {
  try {
    const holiday = await systemService.createHoliday(req.body);
    res.status(201).json(holiday);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creando festivo" });
  }
};

const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await systemService.deleteHoliday(id);

    if (!deleted) {
      return res.status(404).json({ message: "Festivo no encontrado" });
    }

    res.json({ message: "Festivo eliminado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error eliminando festivo" });
  }
};

const getOperationalStatus = async (_req, res) => {
  try {
    const operational = await canOperateToday();
    const isHistorical = await isPastPeriodEnd();

    res.json({
      canOperate: operational.allowed,
      reason: operational.reason,
      isHistoricalMode: isHistorical,
      timestamp: getBogotaDateTime(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error obteniendo estado operacional" });
  }
};

module.exports = {
  getServerTime,
  getHealth,
  getSystemSettings,
  updateSystemSettings,
  getWorkingDays,
  updateWorkingDays,
  getHolidays,
  createHoliday,
  deleteHoliday,
  getOperationalStatus,
};
