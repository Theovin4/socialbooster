import { describe, expect, it } from "vitest";
import { publicServiceId } from "./service-public-id";

describe("public service identifiers", () => {
  it("is stable and does not expose provider names", () => {
    const id = publicServiceId("followspanel_33572");
    expect(id).toMatch(/^SB-[A-F0-9]{16}$/);
    expect(id).toBe(publicServiceId("followspanel_33572"));
    expect(id.toLowerCase()).not.toContain("followspanel");
  });

  it("keeps different internal services distinct", () => {
    expect(publicServiceId("nitro_1")).not.toBe(publicServiceId("smmworld_1"));
  });
});
