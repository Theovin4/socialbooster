import "server-only";

type FunctionTimingStart = {
  wallStartedAt: number;
  cpuStartedAt: NodeJS.CpuUsage;
};

export type FunctionTiming = {
  wallMs: number;
  cpuMs: number;
  cpuToWallRatio: number;
};

/**
 * Lightweight diagnostics for low-frequency background functions. Vercel
 * Active CPU excludes most network wait time, so recording both measurements
 * helps distinguish local parsing work from slow provider responses. A Fluid
 * instance may serve concurrent requests, therefore this is operational
 * evidence rather than an accounting-grade per-request CPU meter.
 */
export function startFunctionTiming(): FunctionTimingStart {
  return { wallStartedAt: performance.now(), cpuStartedAt: process.cpuUsage() };
}

export function finishFunctionTiming(start: FunctionTimingStart): FunctionTiming {
  const wallMs = Math.max(0, performance.now() - start.wallStartedAt);
  const cpu = process.cpuUsage(start.cpuStartedAt);
  const cpuMs = Math.max(0, (cpu.user + cpu.system) / 1_000);
  return {
    wallMs: Math.round(wallMs),
    cpuMs: Math.round(cpuMs),
    cpuToWallRatio: wallMs > 0 ? Number((cpuMs / wallMs).toFixed(4)) : 0,
  };
}
