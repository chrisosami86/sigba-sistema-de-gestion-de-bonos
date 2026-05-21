const DEBUG = process.env.BONOS_DEBUG === "true";

const log = (tag, data) => {
  if (!DEBUG) return;
  console.info(tag, { ...data, timestamp: new Date().toISOString() });
};

const info = (tag, data) => {
  console.info(tag, { ...data, timestamp: new Date().toISOString() });
};

const error = (tag, data) => {
  console.error(tag, { ...data, timestamp: new Date().toISOString() });
};

module.exports = { DEBUG, log, info, error };
