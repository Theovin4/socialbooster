import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { compactPublicCatalogItem, publicCatalogHash, shouldPublishPublicSnapshot, type PublicCatalogSnapshotItem } from "./public-catalog-snapshot";

const item: PublicCatalogSnapshotItem = {
  id: "service_public_1", internalId: "followspanel_1", name: "Service", category: "Instagram", type: "Default",
  min: 10, max: 10_000, refill: true, cancel: false, rateMinor: 1_400,
  updatedAt: "2026-01-01T00:00:00.000Z", seoEligible: true, featured: false, paidAdsEligible: false, active: true,
  s: { p: "Instagram", k: "Followers", t: "Profile" },
};

describe("Firebase optimization architecture", () => {
  it("does not republish an unchanged public catalogue", () => {
    const hash = publicCatalogHash([item]);
    expect(shouldPublishPublicSnapshot(hash, publicCatalogHash([{ ...item, updatedAt: "2026-10-01T00:00:00.000Z" }]))).toBe(false);
    expect(shouldPublishPublicSnapshot(hash, publicCatalogHash([{ ...item, rateMinor: 1_500 }]))).toBe(true);
  });

  it("keeps the v3 hash shape compatible while hashing v4 semantics", () => {
    const { s: _semantics, updatedAt: _updatedAt, ...legacy } = item;
    const expectedV3 = createHash("sha256").update(JSON.stringify([legacy])).digest("hex");
    expect(publicCatalogHash([{ ...item, s: undefined }])).toBe(expectedV3);
    expect(publicCatalogHash([item])).not.toBe(expectedV3);
  });

  it("keeps immutable catalogue chunks cached by snapshot hash without time expiry or broad invalidation", () => {
    const catalog = readFileSync(new URL("./service-catalog.ts", import.meta.url), "utf8");
    const chunkCache = catalog.slice(catalog.indexOf("const getCachedSnapshotChunk"), catalog.indexOf("type DescriptorSlot"));
    expect(chunkCache).toContain("active-service-catalog-chunk-v2-immutable");
    expect(chunkCache).toContain("provider: ProviderKey, version: PublicCatalogSnapshotVersion");
    expect(chunkCache).toContain("index: number, hash: string");
    expect(chunkCache).not.toContain("revalidate:");
    expect(chunkCache).not.toContain("tags:");
    expect(catalog).not.toContain("revalidate: 86_400");
  });

  it("invalidates the catalogue only after a public snapshot change", () => {
    const cron = readFileSync(new URL("../app/api/cron/services/route.ts", import.meta.url), "utf8");
    const admin = readFileSync(new URL("../app/admin/services/actions.ts", import.meta.url), "utf8");
    const sync = readFileSync(new URL("./services-sync.ts", import.meta.url), "utf8");
    expect(cron).toContain("services.value.publicCatalogueChanged");
    expect(admin).toContain("refresh(publicCatalogueChanged)");
    expect(sync).toContain("publicCatalogueChanged");
    expect(sync).toContain("combinedPublicHash");
    expect(sync).toContain("providerSnapshotHashes");
  });

  it("derives repeated service descriptions instead of storing them in snapshot rows", () => {
    const snapshot = readFileSync(new URL("./public-catalog-snapshot.ts", import.meta.url), "utf8");
    const sync = readFileSync(new URL("./services-sync.ts", import.meta.url), "utf8");
    const itemShape = snapshot.slice(snapshot.indexOf("export type PublicCatalogSnapshotItem"), snapshot.indexOf("export type SnapshotSlot"));
    expect(itemShape).not.toContain("description");
    expect(sync).not.toContain("safeDescription");
    expect(compactPublicCatalogItem({ ...item, description: "legacy repeated text" } as PublicCatalogSnapshotItem & { description: string })).not.toHaveProperty("description");
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

  it("forces a bounded snapshot rebuild when catalogue quality rules change", () => {
    const sync = readFileSync(new URL("./services-sync.ts", import.meta.url), "utf8");
    expect(sync).toContain("QUALITY_RULESET_VERSION = 4");
    expect(sync).toContain("qualityMigration");
    expect(sync).not.toContain("if (!quality.publicEligible && !old) return null");
  });

  it("revalidates API and mass-order service IDs before wallet debit", () => {
    const api = readFileSync(new URL("../app/api/v2/route.ts", import.meta.url), "utf8");
    const mass = readFileSync(new URL("../app/dashboard/orders/actions.ts", import.meta.url), "utf8");
    const orders = readFileSync(new URL("./orders.ts", import.meta.url), "utf8");
    expect(api).toContain("resolveServiceIdentifier");
    expect(api).toContain("createAndSubmitOrder");
    expect(mass).toContain("resolveServiceIdentifier");
    expect(mass).toContain("createAndSubmitOrder");
    expect(orders.indexOf("assertServiceOrderEligible(data)")).toBeLessThan(orders.indexOf("transaction.set(walletRef"));
  });

  it("keeps GA4 pageviews out of Firestore and wallet funding out of acquisition revenue", () => {
    const consent = readFileSync(new URL("../components/consent-manager.tsx", import.meta.url), "utf8");
    const growth = readFileSync(new URL("./growth-server.ts", import.meta.url), "utf8");
    expect(consent).toContain('trackAnalyticsEvent("page_view"');
    expect(consent).not.toContain("adminDb");
    expect(consent).not.toContain('collection("page');
    expect(growth).not.toContain("wallet_fund");
    expect(growth).not.toContain("paymentIntent");
  });
});
