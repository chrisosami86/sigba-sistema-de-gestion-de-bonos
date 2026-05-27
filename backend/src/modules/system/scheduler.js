const bonosService = require("../bonos/bonos.service");
const { canOperateToday } = require("./operational-calendar.helper");
const dailyClosureService = require("./daily-closure.service");
const { info, error } = require("../../shared/helpers/logger.helper");
const { getBogotaDate, getBogotaDateTime, getBogotaNow } = require("../../shared/helpers/timezone.helper");

const SCHEDULER_INTERVAL_MS = 60_000;
let intervalId = null;
let running = false;
let active = false;
let lastCycleAt = null;
let lastExpireCount = 0;
let lastErrorAt = null;
let lastErrorMessage = null;
let startTime = null;
let lastSkippedAt = null;
let lastSkippedReason = null;

const start = () => {
  if (intervalId) return;

  active = true;
  startTime = getBogotaDateTime();

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
    const cycleNow = getBogotaNow();
    info("[scheduler.tz]", {
      bogotaDateTime: getBogotaDateTime(),
      local: cycleNow.toString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      bogotaDate: getBogotaDate(),
    });

    const operationalCheck = await canOperateToday();

    if (!operationalCheck.allowed) {
      lastSkippedAt = getBogotaDateTime();
      lastSkippedReason = operationalCheck.reason;
      info("[scheduler] skipped non-operational day", { reason: operationalCheck.reason });
      return;
    }

    const result = await bonosService.expireBonos();
    const expired = Array.isArray(result) ? result.length : 0;

    lastCycleAt = getBogotaDateTime();
    lastExpireCount = expired;

    if (expired > 0) {
      info("[scheduler] expireBonos ejecutado", { expired });
    }

    const today = getBogotaDate();
    try {
      await dailyClosureService.ensurePendingConfirmation(today);
    } catch (closureErr) {
      error("[scheduler] daily-closure ensure", { message: closureErr.message });
    }
  } catch (err) {
    lastErrorAt = getBogotaDateTime();
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
  lastSkippedAt,
  lastSkippedReason,
  intervalMs: SCHEDULER_INTERVAL_MS,
  currentlyRunning: running,
});

module.exports = { start, stop, getStatus };
