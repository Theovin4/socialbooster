import { describe, expect, it } from "vitest";
import { finishFunctionTiming, startFunctionTiming } from "./function-timing";

describe("function timing diagnostics", () => {
  it("reports bounded non-negative wall and CPU measurements", () => {
    const start = startFunctionTiming();
    let checksum = 0;
    for (let index = 0; index < 10_000; index += 1) checksum += index % 17;
    const result = finishFunctionTiming(start);
    expect(checksum).toBeGreaterThan(0);
    expect(result.wallMs).toBeGreaterThanOrEqual(0);
    expect(result.cpuMs).toBeGreaterThanOrEqual(0);
    expect(result.cpuToWallRatio).toBeGreaterThanOrEqual(0);
  });
});
