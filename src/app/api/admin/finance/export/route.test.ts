import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "@e965/xlsx";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  loadFinanceData: vi.fn(),
  loadFinanceDashboardData: vi.fn(),
}));

vi.mock("@/lib/firebase/session", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/finance-data", () => ({
  loadFinanceData: mocks.loadFinanceData,
  loadFinanceDashboardData: mocks.loadFinanceDashboardData,
}));

import { GET } from "./route";

describe("admin finance export", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset().mockResolvedValue(undefined);
    mocks.loadFinanceData.mockReset().mockResolvedValue({
      period: {
        start: new Date("2026-01-01T00:00:00.000Z"),
        end: new Date("2026-01-31T23:59:59.999Z"),
      },
      orders: [
        {
          id: "order-1",
          createdAt: new Date("2026-01-03T12:00:00.000Z"),
          serviceName: "Example service",
          status: "completed",
          quantity: 5,
          customerPriceMinor: 50_000,
          refundedAmountMinor: 0,
          providerCostIncurredMinor: 20_000,
          providerCostMinor: 20_000,
          providerAccepted: true,
          providerOrderId: 123,
        },
      ],
      transactions: [
        {
          id: "transaction-1",
          createdAt: new Date("2026-01-02T12:00:00.000Z"),
          type: "deposit",
          deltaMinor: 120_000,
          reference: "payment-reference",
        },
      ],
      availability: {
        orders: true,
        transactions: true,
        unavailable: [],
      },
      walletLiabilityMinor: 120_000,
      truncated: false,
      limit: 1_000,
    });
    mocks.loadFinanceDashboardData.mockReset().mockResolvedValue({
      summary: {
        depositsMinor: 120_000,
        orderValueMinor: 50_000,
        refundsMinor: 0,
        netSalesMinor: 50_000,
        capitalDeployedMinor: 20_000,
        grossProfitMinor: 30_000,
        grossMarginBps: 6_000,
        walletLiabilityMinor: 120_000,
      },
      health: { available: true },
    });
  });

  it("preserves finance sheets, figures, formats, filters and non-revenue deposit definitions", async () => {
    const response = await GET(
      new Request("https://socialbooster.test/api/admin/finance/export"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(mocks.loadFinanceData).toHaveBeenCalledWith(
      { range: "30d", from: undefined, to: undefined, status: "all" },
      { limit: 1_000 },
    );

    const workbook = XLSX.read(
      new Uint8Array(await response.arrayBuffer()),
      { type: "array", cellNF: true },
    );
    expect(workbook.SheetNames).toEqual([
      "Summary",
      "Orders",
      "Transactions",
      "Definitions",
    ]);
    expect(workbook.Sheets.Summary.B8.v).toBe(1_200);
    expect(workbook.Sheets.Summary.B8.z).toContain("₦");
    expect(workbook.Sheets.Orders.A2.v).toBe("order-1");
    expect(workbook.Sheets.Orders.J2.v).toBe(300);
    expect(workbook.Sheets.Orders["!autofilter"]).toEqual({ ref: "A1:K2" });
    expect(workbook.Sheets.Transactions["!autofilter"]).toEqual({
      ref: "A1:E2",
    });
    expect(workbook.Sheets.Transactions.A2.v).toBe("transaction-1");
    expect(workbook.Sheets.Transactions.D2.v).toBe(1_200);
    expect(workbook.Sheets.Definitions.B2.v).toContain(
      "cash inflow, not revenue",
    );
  });
});
