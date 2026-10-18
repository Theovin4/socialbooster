import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  providerConfirmationClaimMatches,
  providerConfirmationRecoveryState,
  providerConfirmationRefundKeys,
  providerOrderIndexId,
} from "./provider-confirmation-recovery";

describe("provider confirmation recovery", () => {
  it("only permits recovery for an ambiguous order without an external ID", () => {
    expect(providerConfirmationRecoveryState({ status: "provider_confirmation_required", providerAccepted: false }).eligible).toBe(true);
    expect(providerConfirmationRecoveryState({ status: "pending", providerAccepted: false }).eligible).toBe(false);
    expect(providerConfirmationRecoveryState({ status: "provider_confirmation_required", providerAccepted: true }).eligible).toBe(false);
    expect(providerConfirmationRecoveryState({ status: "provider_confirmation_required", providerOrderId: 42 }).eligible).toBe(false);
  });

  it("allows only an identical interrupted decision to resume", () => {
    const accepted = { providerConfirmationDecision: "accepted", providerConfirmationExternalId: 42 };
    expect(providerConfirmationClaimMatches(accepted, "accepted", 42)).toBe(true);
    expect(providerConfirmationClaimMatches(accepted, "accepted", 43)).toBe(false);
    expect(providerConfirmationClaimMatches(accepted, "rejected")).toBe(false);
    expect(providerConfirmationClaimMatches({ providerConfirmationDecision: "rejected" }, "rejected")).toBe(true);
  });

  it("uses a provider-scoped external-order uniqueness key", () => {
    expect(providerOrderIndexId("nitro", 99)).toBe("nitro:99");
    expect(providerOrderIndexId("smmworld", 99)).toBe("smmworld:99");
    expect(() => providerOrderIndexId("", 99)).toThrow();
    expect(() => providerOrderIndexId("nitro", 0)).toThrow();
  });

  it("accounts for every existing refund source before recovery credits a wallet", () => {
    expect(providerConfirmationRefundKeys("order-1")).toEqual([
      "refund:order-1",
      "status-refund:order-1",
      "admin-order-refund:order-1",
      "provider-confirmation-refund:order-1",
    ]);
  });

  it("permits only the explicit one-time admin retry and keeps generic refunds blocked", () => {
    const actions = readFileSync(new URL("../app/admin/provider/actions.ts", import.meta.url), "utf8");
    const attach = actions.slice(actions.indexOf("export async function confirmProviderAccepted"), actions.indexOf("export async function confirmProviderRejected"));
    const retry = actions.slice(actions.indexOf("export async function retryProviderSubmissionOnce"), actions.indexOf("export async function verifyProviderOrderHealth"));
    expect(attach).toContain("provider.client.status");
    expect(attach).not.toContain("provider.client.add");
    expect(retry.match(/provider\.client\.add/g)).toHaveLength(1);
    expect(retry).not.toContain("order_debit");
    expect(retry).not.toContain("availableMinor");
    expect(actions).toContain("providerConfirmationRetryUsed");
    expect(actions).toContain('Resolve provider confirmation before issuing a refund');
  });

  it("finds aged review orders without calling provider add from cron", () => {
    const cron = readFileSync(new URL("../app/api/cron/orders/route.ts", import.meta.url), "utf8");
    expect(cron).toContain('where("status", "==", "provider_confirmation_required")');
    expect(cron).toContain("limit(50)");
    expect(cron).not.toContain(".client.add");
  });

  it("keeps customer review messages white-labelled", () => {
    const orders = readFileSync(new URL("./orders.ts", import.meta.url), "utf8");
    const message = orders.match(/PROVIDER_REVIEW_CUSTOMER_MESSAGE = "([^"]+)"/)?.[1] || "";
    expect(message).toContain("You don't need to place another order");
    expect(message).not.toMatch(/Followpanel|Nitro|SMM World|provider order|provider cost/i);
    expect(orders).toContain("providerCostIncurredMinor: 0");
    expect(orders).toContain("String(local.providerLabel)");
  });

  it("keeps customer API status responses free of provider identity fields", () => {
    const api = readFileSync(new URL("../app/api/v2/route.ts", import.meta.url), "utf8");
    const statusResponse = api.slice(api.indexOf('if (action === "status")'), api.indexOf('throw new CustomerApiError("Unsupported action"'));
    expect(statusResponse).not.toMatch(/provider(?:Key|Label|OrderId|ServiceId)\s*:/);
  });
});
