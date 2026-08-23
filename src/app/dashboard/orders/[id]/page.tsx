import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/toast";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { formatMoney } from "@/lib/money";
import { requestCancellation, requestRefill } from "../request-actions";

export const dynamic = "force-dynamic";
export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { notice } = await searchParams;
  const snapshot = await adminDb().collection("orders").doc(id).get();
  if (!snapshot.exists || snapshot.get("userId") !== user.uid) notFound();
  const order = snapshot.data()!;
  return <AppShell>{notice === "order-created" ? <Toast type="success" title="Order submitted" message="Your order was created successfully. You can follow its progress on this page." /> : null}<span className="eyebrow">Order details</span><h1 className="page-heading">{order.serviceName}</h1><div className="grid3"><div className="glass card"><p className="muted">Status</p><strong style={{ textTransform: "capitalize" }}>{String(order.status).replaceAll("_", " ")}</strong></div><div className="glass card"><p className="muted">Quantity</p><strong>{Number(order.quantity).toLocaleString("en-NG")}</strong></div><div className="glass card"><p className="muted">Total</p><strong>{formatMoney(BigInt(order.customerPriceMinor), order.currency)}</strong></div></div><div className="glass card" style={{ marginTop: 20 }}><p className="muted">Target link</p><p style={{ overflowWrap: "anywhere" }}>{order.link}</p><p className="muted">Order reference: {order.providerOrderId || "Awaiting confirmation"}</p><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{order.refillSupported && order.status === "completed" ? <form action={requestRefill}><input type="hidden" name="id" value={id} /><button className="btn">Request refill</button></form> : null}{order.cancelSupported && ["pending", "processing", "in_progress"].includes(order.status) ? <form action={requestCancellation}><input type="hidden" name="id" value={id} /><button className="btn">Request cancellation</button></form> : null}</div></div></AppShell>;
}
