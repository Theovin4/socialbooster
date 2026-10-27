import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("order tracking integration", () => {
  it("passes a recovered provider response through the shared synchronizer immediately", () => {
    const actions = read("../app/admin/provider/actions.ts");
    const attach = actions.slice(actions.indexOf("export async function confirmProviderAccepted"), actions.indexOf("export async function confirmProviderRejected"));
    expect(attach).toContain("recordFinanceProviderAccepted");
    expect(attach).toContain("PrefetchedProviderStatuses");
    expect(attach).toContain("synchronizeOrderDocuments([accepted], true, prefetched)");
    expect(attach).not.toContain("provider.client.add");
  });

  it("keeps provider acceptance cost and external identity idempotent", () => {
    const finance = read("./firebase/analytics-rollups.ts");
    const acceptance = finance.slice(finance.indexOf("export async function recordFinanceProviderAccepted"), finance.indexOf("function finiteNumber"));
    expect(acceptance).toContain("providerOrderIndexId");
    expect(acceptance).toContain("if (existing.exists)");
    expect(acceptance).toContain("providerCostIncurredMinor: providerCostMinor");
  });

  it("uses the authoritative paginated sweeper for admin refresh and cron", () => {
    const actions = read("../app/admin/provider/actions.ts");
    const refresh = actions.slice(actions.indexOf("export async function refreshLiveOrders"), actions.indexOf("export async function refundOrder"));
    const cron = read("../app/api/cron/orders/route.ts");
    expect(refresh).toContain("synchronizeActiveOrders");
    expect(refresh).not.toContain(".limit(100)");
    expect(cron).toContain('synchronizeActiveOrders({ source: "cron", force: true })');
  });

  it("persists customer detail and current-page refreshes only", () => {
    const detail = read("../app/dashboard/orders/[id]/page.tsx");
    const list = read("../app/dashboard/orders/page.tsx");
    expect(detail).toContain("synchronizeOrderDocuments([snapshot]");
    expect(detail).toContain("snapshot.get(\"userId\") !== user.uid");
    expect(list).toContain(".limit(20)");
    expect(list).toContain("snapshot = await query.get()");
    expect(list).toContain("synchronizeOrderDocuments(snapshot.docs");
  });

  it("batches provider status calls and deduplicates transition/refund events", () => {
    const sync = read("./order-sync.ts");
    expect(sync).toContain("PROVIDER_STATUS_BATCH_SIZE = 100");
    expect(sync).toContain("recordFinanceOrderStatus");
    expect(sync).toContain("if (!transition.duplicate)");
    expect(sync).toContain('doc(`refund:${doc.id}`)');
    expect(sync).toContain('idempotencyKey: `status-refund:${doc.id}`');
  });

  it("blocks generic refunds for active provider-backed orders on the server and in the UI", () => {
    const actions = read("../app/admin/provider/actions.ts");
    const refund = actions.slice(actions.indexOf("export async function refundOrder"), actions.indexOf("export async function refreshOrder"));
    const admin = read("../app/admin/provider/page.tsx");
    expect(refund).toContain("genericActiveProviderRefundBlocked");
    expect(admin).toContain("Verify live status");
    expect(admin).toContain("activeProviderBacked");
  });

  it("keeps provider-confirmation orders out of automatic tracking and submission", () => {
    const sweeper = read("./active-order-sweeper.ts");
    const cron = read("../app/api/cron/orders/route.ts");
    expect(sweeper).not.toContain("provider_confirmation_required");
    expect(cron).not.toContain("client.add");
  });

  it("keeps the Firestore scan and provider calls bounded", () => {
    const sweeper = read("./active-order-sweeper.ts");
    const sync = read("./order-sync.ts");
    expect(sweeper).toContain("ACTIVE_ORDER_PAGE_SIZE = 100");
    expect(sweeper).toContain("DEFAULT_ORDER_TRACKING_MAX_PER_RUN = 500");
    expect(sweeper).toContain('process.env.ORDER_TRACKING_MAX_PER_RUN');
    expect(sync).toContain("boundedBatches(missingIds, PROVIDER_STATUS_BATCH_SIZE)");
  });

  it("tracks progress, freshness and refund evidence without exposing it as transient UI data", () => {
    const sync = read("./order-sync.ts");
    const admin = read("../app/admin/provider/page.tsx");
    expect(sync).toContain("deliveredQuantity");
    expect(sync).toContain("progressPercent");
    expect(sync).toContain("lastProviderUpdate");
    expect(sync).toContain("refundTransactionId");
    expect(admin).not.toContain("provider.client.statuses");
  });

  it("keeps customer tracking white-labelled", () => {
    const detail = read("../app/dashboard/orders/[id]/page.tsx");
    const list = read("../app/dashboard/orders/page.tsx");
    for (const source of [detail, list]) {
      expect(source).not.toMatch(/Followpanel|Nitro NG|SMM World|providerLabel/);
    }
  });
});
