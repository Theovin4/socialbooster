import { describe, expect, it } from "vitest";
import { shouldSendOrderStatusEmail } from "./order-email-policy";

describe("customer order email policy", () => {
  it("does not email routine intermediate status changes", () => {
    expect(shouldSendOrderStatusEmail("pending", 1)).toBe(false);
    expect(shouldSendOrderStatusEmail("processing", 1)).toBe(false);
    expect(shouldSendOrderStatusEmail("in_progress", 1)).toBe(false);
  });
  it("limits routine order emails to two", () => {
    expect(shouldSendOrderStatusEmail("completed", 1)).toBe(true);
    expect(shouldSendOrderStatusEmail("completed", 2)).toBe(false);
  });
  it("always permits a problem notification", () => {
    expect(shouldSendOrderStatusEmail("failed", 2)).toBe(true);
    expect(shouldSendOrderStatusEmail("partial", 2)).toBe(true);
    expect(shouldSendOrderStatusEmail("cancelled", 2)).toBe(true);
  });
});
