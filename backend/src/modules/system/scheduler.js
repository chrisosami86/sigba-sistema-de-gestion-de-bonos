const bonosService = require("../bonos/bonos.service");
const { info, error } = require("../../shared/helpers/logger.helper");

const SCHEDULER_INTERVAL_MS = 60_000;
let intervalId = null;
let running = false;
let active = false;
let lastCycleAt = null;
let lastExpireCount = 0;
let lastErrorAt = null;
let lastErrorMessage = null;
let startTime = null;

const start = () => {
  if (intervalId) return;

  active = true;
  startTime = new Date().toISOString();

  info("[scheduler] start", { intervalMs: SCHEDULER_INTERVAL_MS });

  runCycle();

  intervalId = setInterval(runCycle, SCHEDULER_INTERVAL_MS);
};

const stop = () => {
  if (!intervalId) return;

  clearInterval(intervalId);
  intervalId = null;
  active = false;

  info("[scheduler] stop", {});
};

const runCycle = async () => {
  if (running) return;

  running = true;

  try {
    const result = await bonosService.expireBonos();
    const expired = Array.isArray(result) ? result.length : 0;

    lastCycleAt = new Date().toISOString();
    lastExpireCount = expired;

    if (expired > 0) {
      info("[scheduler] expireBonos ejecutado", { expired });
    }
  } catch (err) {
    lastErrorAt = new Date().toISOString();
    lastErrorMessage = err.message;
    error("[scheduler] error", { message: err.message });
  } finally {
    running = false;
  }
};

const getStatus = () => ({
  active,
  startTime,
  lastCycleAt,
  lastExpireCount,
  lastErrorAt,
  lastErrorMessage,
  intervalMs: SCHEDULER_INTERVAL_MS,
  currentlyRunning: running,
});

module.exports = { start, stop, getStatus };
