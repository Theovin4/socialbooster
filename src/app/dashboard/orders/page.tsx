import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { formatMoney } from "@/lib/money";
import { synchronizeUserOrders } from "@/lib/order-sync";

export const dynamic = "force-dynamic";
const filters = [
  "all",
  "pending",
  "in_progress",
  "processing",
  "completed",
  "partial",
  "cancelled",
  "failed",
];
function date(value: { toDate?: () => Date } | undefined) {
  return (
    value
      ?.toDate?.()
      .toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Lagos",
      }) || "Processing"
  );
}
function count(value: unknown) {
  if (value === null || value === undefined || value === "") return "Waiting";
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed.toLocaleString("en-NG")
    : "Waiting";
}
function progress(quantity: unknown, remains: unknown, status: unknown) {
  const total = Number(quantity);
  if (remains === null || remains === undefined || remains === "")
    return String(status) === "completed" ? 100 : 0;
  const left = Number(remains);
  if (String(status) === "completed") return 100;
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(left)) return 0;
  return Math.max(0, Math.min(100, Math.round(((total - left) * 100) / total)));
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; refresh?: string }>;
}) {
  const user = await requireUser();
  const { status = "all", q = "", refresh } = await searchParams;
  let refreshFailed = false;
  try {
    await synchronizeUserOrders(user.uid, refresh === "1");
  } catch (error) {
    refreshFailed = true;
    console.warn("[orders] customer status refresh failed", {
      userId: user.uid,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
  const snapshot = await adminDb()
    .collection("orders")
    .where("userId", "==", user.uid)
    .limit(250)
    .get();
  const needle = q.trim().toLowerCase();
  const orders = snapshot.docs
    .sort(
      (a, b) =>
        (b.get("createdAt")?.toMillis?.() || 0) -
        (a.get("createdAt")?.toMillis?.() || 0),
    )
    .filter((doc) => {
      const item = doc.data();
      const current = String(item.status || "pending").toLowerCase();
      return (
        (status === "all" || current === status) &&
        (!needle ||
          `${doc.id} ${item.serviceName} ${item.link}`
            .toLowerCase()
            .includes(needle))
      );
    })
    .slice(0, 100);
  const refreshHref = `/dashboard/orders?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}&refresh=1`;

  return (
    <AppShell>
      {refreshFailed ? (
        <Toast
          kind="info"
          title="Showing the latest saved update"
          message="Live status is temporarily unavailable. Your order is still safe; try refreshing again shortly."
        />
      ) : refresh === "1" ? (
        <Toast
          kind="success"
          title="Orders refreshed"
          message="The latest available service progress has been loaded."
        />
      ) : null}
      <span className="eyebrow">Order management</span>
      <h1 className="page-heading">Your orders</h1>
      <p className="muted page-lead">
        Track start count, remaining quantity and delivery progress. Active
        orders refresh automatically when this page is opened.
      </p>
      <div className="section-head">
        <div className="order-filters">
          {filters.map((item) => (
            <Link
              className={`btn${status === item ? " primary" : ""}`}
              key={item}
              href={`/dashboard/orders?status=${item}`}
            >
              {item.replaceAll("_", " ")}
            </Link>
          ))}
        </div>
        <div className="order-tools">
          <form>
            <input type="hidden" name="status" value={status} />
            <input
              className="field"
              name="q"
              defaultValue={q}
              placeholder="Search orders"
              aria-label="Search orders"
            />
            <button className="btn">Search</button>
          </form>
          <Link className="btn" href={refreshHref}>
            Refresh progress
          </Link>
        </div>
      </div>
      {orders.length === 0 ? (
        <div className="glass card">
          <h2>No matching orders</h2>
          <p className="muted">
            Place your first order or choose another filter.
          </p>
          <Link className="btn primary" href="/dashboard/new-order">
            Create order
          </Link>
        </div>
      ) : (
        <>
          <div className="glass data-table-wrap orders-desktop">
            <table className="data-table orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Service</th>
                  <th>Start count</th>
                  <th>Quantity</th>
                  <th>Remaining</th>
                  <th>Charge</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((doc) => {
                  const item = doc.data();
                  const percent = progress(
                    item.quantity,
                    item.remains,
                    item.status,
                  );
                  return (
                    <tr key={doc.id}>
                      <td>#{doc.id.slice(0, 8)}</td>
                      <td>{date(item.createdAt)}</td>
                      <td style={{ maxWidth: 330 }}>
                        {item.serviceName}
                        <div
                          className="progress-track"
                          aria-label={`${percent}% delivered`}
                        >
                          <span style={{ width: `${percent}%` }} />
                        </div>
                      </td>
                      <td>{count(item.startCount)}</td>
                      <td>{count(item.quantity)}</td>
                      <td>
                        {String(item.status) === "completed"
                          ? "0"
                          : count(item.remains)}
                      </td>
                      <td>
                        {formatMoney(
                          BigInt(item.customerPriceMinor || 0),
                          String(item.currency || "NGN"),
                        )}
                      </td>
                      <td>
                        <span className="status-pill">
                          {String(item.status || "pending").replaceAll(
                            "_",
                            " ",
                          )}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="btn"
                          href={`/dashboard/orders/${doc.id}`}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="orders-mobile">
            {orders.map((doc) => {
              const item = doc.data();
              const percent = progress(
                item.quantity,
                item.remains,
                item.status,
              );
              return (
                <article className="glass card" key={doc.id}>
                  <div className="section-head">
                    <strong>#{doc.id.slice(0, 8)}</strong>
                    <span className="status-pill">
                      {String(item.status || "pending").replaceAll("_", " ")}
                    </span>
                  </div>
                  <h2>{item.serviceName}</h2>
                  <p className="muted">{date(item.createdAt)}</p>
                  <div className="mobile-order-stats">
                    <span>
                      Start<strong>{count(item.startCount)}</strong>
                    </span>
                    <span>
                      Quantity<strong>{count(item.quantity)}</strong>
                    </span>
                    <span>
                      Remaining
                      <strong>
                        {String(item.status) === "completed"
                          ? "0"
                          : count(item.remains)}
                      </strong>
                    </span>
                  </div>
                  <div
                    className="progress-track"
                    aria-label={`${percent}% delivered`}
                  >
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  <div className="section-head" style={{ margin: "16px 0 0" }}>
                    <strong>
                      {formatMoney(
                        BigInt(item.customerPriceMinor || 0),
                        String(item.currency || "NGN"),
                      )}
                    </strong>
                    <Link className="btn" href={`/dashboard/orders/${doc.id}`}>
                      View details
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}
