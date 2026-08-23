import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/firebase/session";
import { loadFinanceData } from "@/lib/finance-data";

export const runtime = "nodejs";
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
  const data = await loadFinanceData(filters);
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
    { header: "Capital Cost (NGN)", key: "cost", width: 21 },
    { header: "Recorded Profit (NGN)", key: "profit", width: 23 },
    { header: "Followpanel Order ID", key: "provider", width: 22 },
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
        cost: item.providerCostMinor / 100,
        profit: item.grossProfitMinor / 100,
        provider: item.providerOrderId || null,
      }),
    );
  applyHeader(orders.getRow(1));
  orders.autoFilter = { from: "A1", to: "I1" };
  orders.getColumn("date").numFmt = "yyyy-mm-dd hh:mm";
  ["charge", "cost", "profit"].forEach((key) => {
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
  const orderEnd = Math.max(2, orders.rowCount),
    transactionEnd = Math.max(2, transactions.rowCount);
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
  const metrics = [
    [
      "Customer deposits",
      `SUMIF('Transactions'!$C$2:$C$${transactionEnd},"deposit",'Transactions'!$D$2:$D$${transactionEnd})`,
    ],
    ["Order value", `SUM('Orders'!$F$2:$F$${orderEnd})`],
    [
      "Customer refunds",
      `SUMIF('Transactions'!$C$2:$C$${transactionEnd},"refund",'Transactions'!$D$2:$D$${transactionEnd})`,
    ],
    ["Net sales", "B9-B10"],
    [
      "Capital deployed",
      `SUMIF('Orders'!$I$2:$I$${orderEnd},">0",'Orders'!$G$2:$G$${orderEnd})`,
    ],
    ["Gross profit", "B11-B12"],
    ["Gross margin", "IFERROR(B13/B11,0)"],
    ["Wallet liability", String(data.walletLiabilityMinor / 100)],
  ];
  metrics.forEach(([label, formula], index) => {
    const row = 8 + index;
    summary.getCell(`A${row}`).value = label;
    summary.getCell(`B${row}`).value =
      index === 7 ? Number(formula) : { formula };
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
      "Customer deposits",
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
      "Recorded Followpanel cost of orders that received a Followpanel order ID.",
    ],
    [
      "Gross profit",
      "Net sales less capital deployed; excludes taxes, payment fees and operating expenses not stored in the application.",
    ],
    [
      "Wallet liability",
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
