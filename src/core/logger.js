/* Minimal structured logger; can be swapped for a real logger later */

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  log: 3,
};

const configuredLevel = (
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "production" ? "warn" : "info")
).toLowerCase();
const activeLevel = LEVELS[configuredLevel] ?? LEVELS.info;

const shouldLog = (level) => {
  const levelWeight = LEVELS[level] ?? LEVELS.info;
  return levelWeight <= activeLevel;
};

const serialize = (level, message, meta = {}) =>
  JSON.stringify({ level, message, ...meta });

export const logger = {
  log: (message, meta = {}) => {
    if (!shouldLog("log")) return;
    // eslint-disable-next-line no-console
    console.log(serialize("log", message, meta));
  },
  info: (message, meta = {}) => {
    if (!shouldLog("info")) return;
    // eslint-disable-next-line no-console
    console.log(serialize("info", message, meta));
  },
  warn: (message, meta = {}) => {
    if (!shouldLog("warn")) return;
    // eslint-disable-next-line no-console
    console.warn(serialize("warn", message, meta));
  },
  error: (message, meta = {}) => {
    if (!shouldLog("error")) return;
    // eslint-disable-next-line no-console
    console.error(serialize("error", message, meta));
  },
};
