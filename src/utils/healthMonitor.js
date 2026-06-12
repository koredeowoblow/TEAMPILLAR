// src/utils/healthMonitor.js
export const startHealthMonitor = () => {
  setInterval(() => {
    const mem = process.memoryUsage();
    const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
    if (parseFloat(heapUsedMB) > 400) {
      console.warn(`[MEM] High heap usage: ${heapUsedMB}MB / ${heapTotalMB}MB`);
    }
  }, 30_000);

  // Event loop lag detection
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const lag = now - last - 1000;
    if (lag > 100) console.warn(`[LOOP] Event loop lag: ${lag}ms`);
    last = now;
  }, 1000);
};
