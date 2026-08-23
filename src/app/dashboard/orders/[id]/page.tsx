import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { formatMoney } from "@/lib/money";
import { synchronizeOrderDocuments } from "@/lib/order-sync";
import { requestCancellation, requestRefill } from "../request-actions";

export const dynamic = "force-dynamic";
const active = new Set([
  "pending",
  "processing",
  "in_progress",
  "cancel_requested",
]);
function count(value: unknown) {
  if (value === null || value === undefined || value === "")
    return "Waiting for update";
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed.toLocaleString("en-NG")
    : "Waiting for update";
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; refresh?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { notice, refresh } = await searchParams;
  const ref = adminDb().collection("orders").doc(id);
  let snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("userId") !== user.uid) notFound();
  let refreshFailed = false;
  if (active.has(String(snapshot.get("status"))) || refresh === "1") {
    try {
      await synchronizeOrderDocuments([snapshot], refresh === "1");
      snapshot = await ref.get();
    } catch (error) {
      refreshFailed = true;
      console.warn("[order] status refresh failed", {
        orderId: id,
        userId: user.uid,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  const order = snapshot.data()!;
  const quantity = Number(order.quantity || 0);
  const remaining =
    String(order.status) === "completed"
      ? 0
      : order.remains === null ||
          order.remains === undefined ||
          order.remains === ""
        ? Number.NaN
        : Number(order.remains);
  const progress =
    String(order.status) === "completed"
      ? 100
      : Number.isFinite(remaining) && quantity > 0
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(((quantity - remaining) * 100) / quantity),
            ),
          )
        : 0;
  const lastUpdate = order.lastProviderUpdate
    ?.toDate?.()
    .toLocaleString("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Lagos",
    });
  return (
    <AppShell>
      {notice === "order-created" ? (
        <Toast
          kind="success"
          title="Order submitted"
          message="Your order was created successfully. Progress will appear as soon as processing begins."
        />
      ) : refreshFailed ? (
        <Toast
          kind="info"
          title="Showing the latest saved update"
          message="Live progress is temporarily unavailable. Your order remains safe; try again shortly."
        />
      ) : refresh === "1" ? (
        <Toast
          kind="success"
          title="Delivery checked"
          message="The latest delivery record has been loaded."
        />
      ) : null}
      <Link className="muted" href="/dashboard/orders">
        ← Back to orders
      </Link>
      <span className="eyebrow" style={{ display: "block", marginTop: 28 }}>
        Order details
      </span>
      <h1 className="page-heading">{order.serviceName}</h1>
      <div className="order-detail-grid">
        <article className="glass card">
          <p className="muted">Status</p>
          <strong style={{ textTransform: "capitalize" }}>
            {String(order.status).replaceAll("_", " ")}
          </strong>
        </article>
        <article className="glass card">
          <p className="muted">Start count</p>
          <strong>{count(order.startCount)}</strong>
        </article>
        <article className="glass card">
          <p className="muted">Quantity ordered</p>
          <strong>{quantity.toLocaleString("en-NG")}</strong>
        </article>
        <article className="glass card">
          <p className="muted">Remaining</p>
          <strong>
            {Number.isFinite(remaining)
              ? remaining.toLocaleString("en-NG")
              : "Waiting for update"}
          </strong>
        </article>
        <article className="glass card">
          <p className="muted">Total charge</p>
          <strong>
            {formatMoney(BigInt(order.customerPriceMinor), order.currency)}
          </strong>
        </article>
      </div>
      <section className="glass card order-progress-card">
        <div className="section-head">
          <div>
            <span className="eyebrow">Delivery progress</span>
            <h2>{progress}% delivered</h2>
          </div>
          <Link className="btn" href={`/dashboard/orders/${id}?refresh=1`}>
            {active.has(String(order.status))
              ? "Refresh progress"
              : "Verify delivery"}
          </Link>
        </div>
        <div
          className="progress-track large"
          aria-label={`${progress}% delivered`}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className="muted">
          {lastUpdate
            ? `Last service update: ${lastUpdate}`
            : "The start count and remaining quantity will appear after the first service update."}
        </p>
      </section>
      <div className="glass card" style={{ marginTop: 20 }}>
        <p className="muted">Target link</p>
        <p style={{ overflowWrap: "anywhere" }}>{order.link}</p>
        <p className="muted">
          Order reference: {order.providerOrderId || "Awaiting confirmation"}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {order.refillSupported && order.status === "completed" ? (
            <form action={requestRefill}>
              <input type="hidden" name="id" value={id} />
              <button className="btn">Request refill</button>
            </form>
          ) : null}
          {order.cancelSupported &&
          ["pending", "processing", "in_progress"].includes(order.status) ? (
            <form action={requestCancellation}>
              <input type="hidden" name="id" value={id} />
              <button className="btn">Request cancellation</button>
            </form>
          ) : null}
          <Link className="btn" href={`/dashboard/support?order=${id}`}>
            Report delivery issue
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
