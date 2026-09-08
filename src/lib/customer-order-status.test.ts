import { describe, expect, it } from "vitest";
import { customerOrderStatusLabel } from "./customer-order-status";

describe("customer order status labels", () => {
  it("never exposes internal provider review terminology", () => {
    expect(customerOrderStatusLabel("provider_confirmation_required")).toBe("Under review");
  });

  it("formats ordinary statuses for customers", () => {
    expect(customerOrderStatusLabel("in_progress")).toBe("In progress");
    expect(customerOrderStatusLabel("completed")).toBe("completed");
  });
});
