import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/firebase/session";
import { loadFinanceDashboardData, loadFinanceData } from "@/lib/finance-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const naira = "₦#,##0.00;[Red](₦#,##0.00);-";
const header = {
  font: { bold: true, color: { argb: "FFFFFFFF" } },
  fill: {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FF172A46" },
  },
  alignment: { vertical: "middle" as const },
};

function applyHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.style = header;
  });
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
    return Response.json({ error: "Finance rollups require a controlled rebuild before an authoritative export can be generated." }, { status: 503 });
  }
  if (!data.availability.orders || !data.availability.transactions || data.walletLiabilityMinor === null) {
    return Response.json({ error: `Finance export data is unavailable: ${data.availability.unavailable.join(", ")}` }, { status: 503 });
  }
  const totals = dashboard.summary;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Social Booster";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;
  const summary = workbook.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
  });
  const orders = workbook.addWorksheet("Orders", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const transactions = workbook.addWorksheet("Transactions", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const definitions = workbook.addWorksheet("Definitions", {
    views: [{ showGridLines: false }],
  });
  orders.columns = [
    { header: "Order ID", key: "id", width: 39 },
    { header: "Date", key: "date", width: 21 },
    { header: "Service", key: "service", width: 55 },
    { header: "Status", key: "status", width: 18 },
    { header: "Quantity", key: "quantity", width: 13 },
    { header: "Customer Charge (NGN)", key: "charge", width: 23 },
    { header: "Customer Refund (NGN)", key: "refund", width: 23 },
    { header: "Net Sales (NGN)", key: "netSales", width: 21 },
    { header: "Provider Cost Incurred (NGN)", key: "cost", width: 29 },
    { header: "Gross Profit (NGN)", key: "profit", width: 22 },
    { header: "Provider Order ID", key: "provider", width: 22 },
  ];
  data.orders
    .sort(
      (a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0),
    )
    .forEach((item) =>
      orders.addRow({
        id: item.id,
        date: item.createdAt || null,
        service: item.serviceName,
        status: item.status,
        quantity: item.quantity,
        charge: item.customerPriceMinor / 100,
        refund: (item.refundedAmountMinor || 0) / 100,
        netSales: (item.customerPriceMinor - (item.refundedAmountMinor || 0)) / 100,
        cost: (item.providerAccepted || Number.isInteger(item.providerOrderId) ? item.providerCostIncurredMinor ?? item.providerCostMinor : 0) / 100,
        profit: (item.customerPriceMinor - (item.refundedAmountMinor || 0) - (item.providerAccepted || Number.isInteger(item.providerOrderId) ? item.providerCostIncurredMinor ?? item.providerCostMinor : 0)) / 100,
        provider: item.providerOrderId || null,
      }),
    );
  applyHeader(orders.getRow(1));
  orders.autoFilter = { from: "A1", to: "K1" };
  orders.getColumn("date").numFmt = "yyyy-mm-dd hh:mm";
  ["charge", "refund", "netSales", "cost", "profit"].forEach((key) => {
    orders.getColumn(key).numFmt = naira;
  });
  transactions.columns = [
    { header: "Transaction ID", key: "id", width: 45 },
    { header: "Date", key: "date", width: 21 },
    { header: "Type", key: "type", width: 22 },
    { header: "Amount (NGN)", key: "amount", width: 20 },
    { header: "Reference", key: "reference", width: 40 },
  ];
  data.transactions
    .sort(
      (a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0),
    )
    .forEach((item) =>
      transactions.addRow({
        id: item.id,
        date: item.createdAt || null,
        type: item.type,
        amount: item.deltaMinor / 100,
        reference: item.reference || "",
      }),
    );
  applyHeader(transactions.getRow(1));
  transactions.autoFilter = { from: "A1", to: "E1" };
  transactions.getColumn("date").numFmt = "yyyy-mm-dd hh:mm";
  transactions.getColumn("amount").numFmt = naira;
  summary.mergeCells("A1:D2");
  summary.getCell("A1").value = "SOCIAL BOOSTER — FINANCE REPORT";
  summary.getCell("A1").style = {
    font: { bold: true, size: 20, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A1730" } },
    alignment: { vertical: "middle", horizontal: "left" },
  };
  summary.getCell("A4").value = "Reporting period";
  summary.getCell("B4").value =
    `${data.period.start?.toISOString().slice(0, 10) || "Beginning"} to ${data.period.end.toISOString().slice(0, 10)}`;
  summary.getCell("A5").value = "Generated";
  summary.getCell("B5").value = new Date();
  summary.getCell("B5").numFmt = "yyyy-mm-dd hh:mm";
  summary.getCell("C4").value = "Order status";
  summary.getCell("D4").value = filters.status.replaceAll("_", " ");
  summary.getCell("A6").value = "Data scope";
  summary.getCell("B6").value = data.truncated
    ? `Detail sheets are truncated at ${data.limit.toLocaleString("en-NG")} records per dataset. Summary totals remain authoritative and complete.`
    : "Complete detail sheets and authoritative summary totals for the selected period";
  if (filters.status !== "all") summary.getCell("B6").value = `${summary.getCell("B6").value}. Order summary metrics use the selected status; deposits, current liability and the Transactions detail sheet remain global for the date period.`;
  const metrics = [
    ["Verified customer deposits", totals.depositsMinor / 100],
    ["Order value", totals.orderValueMinor / 100],
    ["Customer refunds", totals.refundsMinor / 100],
    ["Net sales", totals.netSalesMinor / 100],
    ["Capital deployed", totals.capitalDeployedMinor / 100],
    ["Gross profit", totals.grossProfitMinor / 100],
    ["Gross margin", totals.grossMarginBps === null ? "N/A" : totals.grossMarginBps / 10_000],
    ["Current NGN wallet liability", totals.walletLiabilityMinor / 100],
  ];
  metrics.forEach(([label, value], index) => {
    const row = 8 + index;
    summary.getCell(`A${row}`).value = label;
    summary.getCell(`B${row}`).value = value;
    summary.getCell(`A${row}`).font = { bold: true };
    summary.getCell(`B${row}`).numFmt = index === 6 ? "0.0%" : naira;
  });
  summary.getCell("A7").value = "Key financial metrics";
  summary.getCell("A7").style = header;
  summary.getCell("B7").style = header;
  summary.columns = [
    { width: 27 },
    { width: 25 },
    { width: 14 },
    { width: 14 },
  ];
  definitions.columns = [
    { header: "Metric", key: "metric", width: 25 },
    { header: "Definition", key: "definition", width: 90 },
  ];
  applyHeader(definitions.getRow(1));
  [
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
  ].forEach(([metric, definition]) =>
    definitions.addRow({ metric, definition }),
  );
  definitions.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="social-booster-finance-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
