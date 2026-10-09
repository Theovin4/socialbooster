import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicCatalogHash, shouldPublishPublicSnapshot, type PublicCatalogSnapshotItem } from "./public-catalog-snapshot";

const item: PublicCatalogSnapshotItem = {
  id: "service_public_1", internalId: "followspanel_1", name: "Service", category: "Instagram", type: "Default",
  description: "Public description", min: 10, max: 10_000, refill: true, cancel: false, rateMinor: 1_400,
  updatedAt: "2026-01-01T00:00:00.000Z", seoEligible: true, featured: false, paidAdsEligible: false, active: true,
};

describe("Firebase optimization architecture", () => {
  it("does not republish an unchanged public catalogue", () => {
    const hash = publicCatalogHash([item]);
    expect(shouldPublishPublicSnapshot(hash, publicCatalogHash([{ ...item, updatedAt: "2026-10-01T00:00:00.000Z" }]))).toBe(false);
    expect(shouldPublishPublicSnapshot(hash, publicCatalogHash([{ ...item, rateMinor: 1_500 }]))).toBe(true);
  });

  it("never lets an anonymous catalogue request scan services", () => {
    const catalog = readFileSync(new URL("./service-catalog.ts", import.meta.url), "utf8");
    const snapshot = readFileSync(new URL("./public-catalog-snapshot.ts", import.meta.url), "utf8");
    expect(catalog).not.toContain('collection("services")');
    expect(snapshot).not.toContain('collection("services")');
  });

  it("resolves service detail pages without a direct Firestore read", () => {
    const page = readFileSync(new URL("../app/services/[id]/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("resolveServiceIdentifier");
    expect(page).not.toContain("adminDb");
  });
});
