import * as XLSX from "@e965/xlsx";
import { requireAdmin } from "@/lib/firebase/session";
import { loadFinanceDashboardData, loadFinanceData } from "@/lib/finance-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const naira = "₦#,##0.00;[Red](₦#,##0.00);-";
const header = [
  "Order ID",
  "Date",
  "Service",
  "Status",
  "Quantity",
  "Customer Charge (NGN)",
  "Customer Refund (NGN)",
  "Net Sales (NGN)",
  "Provider Cost Incurred (NGN)",
  "Gross Profit (NGN)",
  "Provider Order ID",
];

function setNumberFormat(
  worksheet: XLSX.WorkSheet,
  address: string,
  format: string,
) {
  const cell = worksheet[address];
  if (cell && typeof cell === "object" && "v" in cell) {
    cell.z = format;
  }
}

export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const filters = {
    range: url.searchParams.get("range") || "30d",
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
    status: url.searchParams.get("status") || "all",
  };
  const [data, dashboard] = await Promise.all([
    loadFinanceData(filters, { limit: 1_000 }),
    loadFinanceDashboardData(filters),
  ]);
  if (!dashboard.summary || !dashboard.health.available) {
    return Response.json(
      {
        error:
          "Finance rollups require a controlled rebuild before an authoritative export can be generated.",
      },
      { status: 503 },
    );
  }
  if (
    !data.availability.orders ||
    !data.availability.transactions ||
    data.walletLiabilityMinor === null
  ) {
    return Response.json(
      {
        error: `Finance export data is unavailable: ${data.availability.unavailable.join(", ")}`,
      },
      { status: 503 },
    );
  }

  const totals = dashboard.summary;
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Author: "Social Booster",
    CreatedDate: new Date(),
    ModifiedDate: new Date(),
  };

  const orders = XLSX.utils.aoa_to_sheet([
    header,
    ...data.orders
      .sort(
        (a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0),
      )
      .map((item) => [
        item.id,
        item.createdAt || null,
        item.serviceName,
        item.status,
        item.quantity,
        item.customerPriceMinor / 100,
        (item.refundedAmountMinor || 0) / 100,
        (item.customerPriceMinor - (item.refundedAmountMinor || 0)) / 100,
        (item.providerAccepted || Number.isInteger(item.providerOrderId)
          ? item.providerCostIncurredMinor ?? item.providerCostMinor
          : 0) / 100,
        (item.customerPriceMinor -
          (item.refundedAmountMinor || 0) -
          (item.providerAccepted || Number.isInteger(item.providerOrderId)
            ? item.providerCostIncurredMinor ?? item.providerCostMinor
            : 0)) /
          100,
        item.providerOrderId || null,
      ]),
  ]);
  orders["!cols"] = [
    { wch: 39 },
    { wch: 21 },
    { wch: 55 },
    { wch: 18 },
    { wch: 13 },
    { wch: 23 },
    { wch: 23 },
    { wch: 21 },
    { wch: 29 },
    { wch: 22 },
    { wch: 22 },
  ];
  orders["!autofilter"] = { ref: "A1:K1" };
  for (let row = 2; row <= data.orders.length + 1; row += 1) {
    setNumberFormat(orders, `B${row}`, "yyyy-mm-dd hh:mm");
    for (const column of ["F", "G", "H", "I", "J"]) {
      setNumberFormat(orders, `${column}${row}`, naira);
    }
  }
  XLSX.utils.book_append_sheet(workbook, orders, "Orders");

  const transactions = XLSX.utils.aoa_to_sheet([
    [
      "Transaction ID",
      "Date",
      "Type",
      "Amount (NGN)",
      "Reference",
    ],
    ...data.transactions
      .sort(
        (a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0),
      )
      .map((item) => [
        item.id,
        item.createdAt || null,
        item.type,
        item.deltaMinor / 100,
        item.reference || "",
      ]),
  ]);
  transactions["!cols"] = [
    { wch: 45 },
    { wch: 21 },
    { wch: 22 },
    { wch: 20 },
    { wch: 40 },
  ];
  transactions["!autofilter"] = { ref: "A1:E1" };
  for (let row = 2; row <= data.transactions.length + 1; row += 1) {
    setNumberFormat(transactions, `B${row}`, "yyyy-mm-dd hh:mm");
    setNumberFormat(transactions, `D${row}`, naira);
  }
  XLSX.utils.book_append_sheet(workbook, transactions, "Transactions");

  const summary = XLSX.utils.aoa_to_sheet([
    ["SOCIAL BOOSTER — FINANCE REPORT"],
    [],
    [],
    [
      "Reporting period",
      `${data.period.start?.toISOString().slice(0, 10) || "Beginning"} to ${data.period.end.toISOString().slice(0, 10)}`,
      "",
      "Order status",
      filters.status.replaceAll("_", " "),
    ],
    ["Generated", new Date()],
    [
      "Data scope",
      data.truncated
        ? `Detail sheets are truncated at ${data.limit.toLocaleString("en-NG")} records per dataset. Summary totals remain authoritative and complete.`
        : "Complete detail sheets and authoritative summary totals for the selected period",
    ],
    ["Key financial metrics"],
    ["Verified customer deposits", totals.depositsMinor / 100],
    ["Order value", totals.orderValueMinor / 100],
    ["Customer refunds", totals.refundsMinor / 100],
    ["Net sales", totals.netSalesMinor / 100],
    ["Capital deployed", totals.capitalDeployedMinor / 100],
    ["Gross profit", totals.grossProfitMinor / 100],
    [
      "Gross margin",
      totals.grossMarginBps === null ? "N/A" : totals.grossMarginBps / 10_000,
    ],
    ["Current NGN wallet liability", totals.walletLiabilityMinor / 100],
  ]);
  if (filters.status !== "all") {
    summary["B6"].v = `${summary["B6"].v}. Order summary metrics use the selected status; deposits, current liability and the Transactions detail sheet remain global for the date period.`;
  }
  summary["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 3 } }];
  summary["!cols"] = [
    { wch: 27 },
    { wch: 25 },
    { wch: 14 },
    { wch: 14 },
  ];
  setNumberFormat(summary, "B5", "yyyy-mm-dd hh:mm");
  for (let row = 8; row <= 15; row += 1) {
    setNumberFormat(summary, `B${row}`, row === 14 ? "0.0%" : naira);
  }
  XLSX.utils.book_append_sheet(workbook, summary, "Summary");

  const definitions = XLSX.utils.aoa_to_sheet([
    ["Metric", "Definition"],
    [
      "Verified customer deposits",
      "Verified money funded into customer wallets; this is cash inflow, not revenue.",
    ],
    [
      "Order value",
      "Customer charges recorded for orders in the selected reporting period before refunds.",
    ],
    [
      "Net sales",
      "Order value less customer wallet refunds in the reporting period.",
    ],
    [
      "Capital deployed",
      "Provider cost incurred only for orders accepted upstream and assigned a provider order ID.",
    ],
    [
      "Gross profit",
      "Net sales less capital deployed; excludes taxes, payment fees and operating expenses not stored in the application.",
    ],
    [
      "Current NGN wallet liability",
      "Current unused NGN customer wallet balances, regardless of the selected date filter.",
    ],
  ]);
  definitions["!cols"] = [{ wch: 25 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(workbook, definitions, "Definitions");
  workbook.SheetNames = ["Summary", "Orders", "Transactions", "Definitions"];

  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  });
  return new Response(buffer, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="social-booster-finance-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
