const { getBogotaDateTime } = require("./timezone.helper");

const DEBUG = process.env.BONOS_DEBUG === "true";

const log = (tag, data) => {
  if (!DEBUG) return;
  console.info(tag, { ...data, timestamp: getBogotaDateTime() });
};

const info = (tag, data) => {
  console.info(tag, { ...data, timestamp: getBogotaDateTime() });
};

const error = (tag, data) => {
  console.error(tag, { ...data, timestamp: getBogotaDateTime() });
};

module.exports = { DEBUG, log, info, error };
