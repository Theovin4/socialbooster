import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANALYTICS_QUALITY_STATES, metricRegistry } from "./analytics-quality";

describe("analytics truthfulness", () => {
  it("defines every permitted data-quality state", () => {
    expect(ANALYTICS_QUALITY_STATES).toEqual(["EXACT", "EXACT_CACHED", "ESTIMATED", "PARTIAL", "STALE", "UNAVAILABLE"]);
    expect(metricRegistry.verifiedDeposits.definition).toContain("Not revenue");
    expect(metricRegistry.walletLiability.label).toContain("NGN wallet liability");
  });

  it("uses complete aggregate counts for crypto and support cards", () => {
    const crypto = readFileSync(new URL("../app/admin/crypto/page.tsx", import.meta.url), "utf8");
    const support = readFileSync(new URL("../app/admin/support/page.tsx", import.meta.url), "utf8");
    expect(crypto.match(/\.count\(\)\.get\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(support.match(/\.count\(\)\.get\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(crypto).not.toContain("expireAwaitingCryptoDeposits");
    expect(crypto).toContain("latest 25");
    expect(support).toContain("latest 25");
  });

  it("sources active-service cards from the deduplicated public catalogue total", () => {
    const admin = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
    const sync = readFileSync(new URL("./services-sync.ts", import.meta.url), "utf8");
    expect(admin).toContain('collection("publicCatalogStats").doc("current")');
    expect(sync).toContain("choosePreferredDuplicateServices");
    expect(sync).toContain("publicEligibleCount: activePublicServices.length");
  });

  it("keeps finance exports authoritative, bounded and provider-neutral", () => {
    const route = readFileSync(new URL("../app/api/admin/finance/export/route.ts", import.meta.url), "utf8");
    expect(route).toContain("dashboard.summary");
    expect(route).toContain("Summary totals remain authoritative and complete");
    expect(route).toContain("Provider Order ID");
    expect(route).not.toContain("Followpanel Order ID");
  });

  it("stores the required cross-page reconciliation comparisons", () => {
    const reconciliation = readFileSync(new URL("./firebase/finance-reconciliation.ts", import.meta.url), "utf8");
    for (const metric of ["adminTotalOrders", "activeServices", "supportOpen", "cryptoApproved", "marketingEligible"]) {
      expect(reconciliation).toContain(metric);
    }
    expect(reconciliation).toContain("authoritativePublicCatalogCount");
    expect(reconciliation).toContain("choosePreferredDuplicateServices");
  });
});
