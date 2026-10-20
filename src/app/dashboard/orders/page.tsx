import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { formatMoney } from "@/lib/money";
import { synchronizeOrderDocuments } from "@/lib/order-sync";
import { customerOrderStatusLabel } from "@/lib/customer-order-status";
import { decodeTimestampCursor, encodeTimestampCursor } from "@/lib/pagination-cursor";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { orderProgress } from "@/lib/order-tracking";

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
  "under_review",
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
function serviceUpdate(value: { toDate?: () => Date } | undefined) {
  return value?.toDate?.().toLocaleString("en-NG", { timeZone: "Africa/Lagos" }) || "Waiting for provider update";
}
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; refresh?: string; after?: string; submitted?: string; attention?: string; failed?: string }>;
}) {
  const user = await requireUser();
  const { status = "all", q = "", refresh, after, submitted, attention, failed } = await searchParams;
  const selectedStatus = status === "under_review" ? "provider_confirmation_required" : status;
  let refreshFailed = false;
  let query: FirebaseFirestore.Query = adminDb().collection("orders").where("userId", "==", user.uid);
  if (filters.includes(status) && status !== "all") query = query.where("status", "==", selectedStatus);
  query = query.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(20);
  const cursor = decodeTimestampCursor(after);
  if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.millis), cursor.id);
  let snapshot = await query.get();
  if (refresh === "1") {
    try {
      await synchronizeOrderDocuments(snapshot.docs.filter((doc) => Number.isInteger(doc.get("providerOrderId"))), true);
      snapshot = await query.get();
    } catch (error) {
      refreshFailed = true;
      console.warn("[orders] customer status refresh failed", {
        userId: user.uid,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  const needle = q.trim().toLowerCase();
  const orders = snapshot.docs.filter((doc) => {
      const item = doc.data();
      const current = String(item.status || "pending").toLowerCase();
      return (
        (status === "all" || current === selectedStatus) &&
        (!needle ||
          `${doc.id} ${item.serviceName} ${item.link}`
            .toLowerCase()
            .includes(needle))
      );
    });
  const refreshHref = `/dashboard/orders?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}&refresh=1`;

  return (
    <AppShell>
      {submitted || failed ? <Toast kind={Number(attention || 0) > 0 || Number(failed || 0) > 0 ? "info" : "success"} title={`${submitted || 0} batch order${submitted === "1" ? "" : "s"} recorded`} message={Number(failed || 0) > 0 ? `${failed} row${failed === "1" ? "" : "s"} could not be submitted and were not charged. ${attention || 0} recorded order${attention === "1" ? "" : "s"} need confirmation.` : Number(attention || 0) > 0 ? `${attention} order${attention === "1" ? "" : "s"} need confirmation; no duplicate charge will be created.` : "Each order passed validation and was submitted safely."} /> : null}
      {refreshFailed ? (
        <Toast
          kind="info"
          title="Showing the latest saved update"
          message="Live status is unavailable. Try again shortly."
        />
      ) : refresh === "1" ? (
        <Toast
          kind="success"
          title="Orders refreshed"
          message="Latest progress loaded."
        />
      ) : null}
      <h1 className="page-heading">Your orders</h1>
      <p className="muted page-lead">
        Track start count, remaining quantity and delivery progress.
      </p>
      {snapshot.size === 20 ? <p className="muted">Showing 20 orders on this page.</p> : null}
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
          <h2>No orders found</h2>
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
                  <th>Last update</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((doc) => {
                  const item = doc.data();
                  const tracking = orderProgress({ quantity: item.quantity, remains: item.remains, status: item.status });
                  return (
                    <tr key={doc.id}>
                      <td>#{doc.id.slice(0, 8)}</td>
                      <td>{date(item.createdAt)}</td>
                      <td style={{ maxWidth: 330 }}>
                        {item.serviceName}
                        <div
                          className="progress-track"
                          aria-label={tracking.percent === null ? "Waiting for provider update" : `${tracking.percent}% delivered`}
                        >
                          <span style={{ width: `${tracking.percent || 0}%` }} />
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
                          {customerOrderStatusLabel(item.status)}
                        </span>
                      </td>
                      <td>{serviceUpdate(item.lastProviderUpdate)}</td>
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
              const tracking = orderProgress({ quantity: item.quantity, remains: item.remains, status: item.status });
              return (
                <article className="glass card" key={doc.id}>
                  <div className="section-head">
                    <strong>#{doc.id.slice(0, 8)}</strong>
                    <span className="status-pill">
                      {customerOrderStatusLabel(item.status)}
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
                    aria-label={tracking.percent === null ? "Waiting for provider update" : `${tracking.percent}% delivered`}
                  >
                    <span style={{ width: `${tracking.percent || 0}%` }} />
                  </div>
                  <p className="muted">Last service update: {serviceUpdate(item.lastProviderUpdate)}</p>
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
          {snapshot.size === 20 && snapshot.docs.at(-1)?.get("createdAt")?.toMillis?.() ? (
            <div style={{ marginTop: 20 }}>
              <Link className="btn" href={`/dashboard/orders?${new URLSearchParams({ status, ...(q ? { q } : {}), after: encodeTimestampCursor({ millis: snapshot.docs.at(-1)!.get("createdAt").toMillis(), id: snapshot.docs.at(-1)!.id }) }).toString()}`}>Next 20 orders</Link>
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
