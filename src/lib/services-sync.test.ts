import { describe, expect, it } from "vitest";
import { diffProviderFingerprints, manualSyncRejection, providerCatalogueHash, removedServiceState } from "./services-sync";

describe("provider catalogue fingerprints", () => {
  it("is order independent", () => {
    const left = [{ id: "a", fingerprint: "1" }, { id: "b", fingerprint: "2" }];
    expect(providerCatalogueHash(left)).toBe(providerCatalogueHash([...left].reverse()));
  });

  it("identifies only new, changed, removed and unchanged records", () => {
    expect(diffProviderFingerprints(
      [{ id: "same", fingerprint: "1" }, { id: "changed", fingerprint: "1" }, { id: "removed", fingerprint: "1" }],
      [{ id: "same", fingerprint: "1" }, { id: "changed", fingerprint: "2" }, { id: "added", fingerprint: "1" }],
    )).toEqual({ added: ["added"], changed: ["changed"], removed: ["removed"], unchanged: 1 });
  });

  it("keeps removed services historical but unavailable", () => {
    expect(removedServiceState()).toEqual({ active: false, publicEligibility: "hidden", hiddenReasons: ["removed_from_provider_catalog"] });
  });

  it("rejects duplicate and rapid manual synchronization", () => {
    const now = Date.now();
    expect(manualSyncRejection({ syncInProgress: true, lockExpiresAt: { toMillis: () => now + 1_000 } }, now, "manual")).toMatch(/already/);
    expect(manualSyncRejection({ lastManualSyncAt: { toMillis: () => now - 30_000 } }, now, "manual")).toMatch(/five minutes/);
    expect(manualSyncRejection({}, now, "scheduled")).toBeNull();
  });
});
