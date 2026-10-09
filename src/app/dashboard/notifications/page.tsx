import Link from "next/link";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { decodeTimestampCursor, encodeTimestampCursor } from "@/lib/pagination-cursor";
import { markNotificationRead } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ after?: string }> }) {
  const user = await requireUser(), { after } = await searchParams, cursor = decodeTimestampCursor(after);
  let query: FirebaseFirestore.Query = adminDb().collection("notifications").where("userId", "==", user.uid).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(20);
  if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.millis), cursor.id);
  const snapshot = await query.get(), last = snapshot.docs.at(-1);
  return <AppShell><h1 className="page-heading">Notifications</h1><p className="muted page-lead">Important account, order and refill updates.</p><div style={{ display: "grid", gap: 12 }}>{snapshot.empty ? <div className="glass card"><h2>You are up to date</h2><p className="muted">No notifications are waiting.</p></div> : snapshot.docs.map((doc) => <article className="glass card" key={doc.id}><div className="section-head"><div><span className="eyebrow">{String(doc.get("type") || "update").replaceAll("_", " ")}</span><h2 style={{ marginBottom: 0 }}>{String(doc.get("title") || "Account update")}</h2></div>{doc.get("read") !== true ? <form action={markNotificationRead}><input type="hidden" name="id" value={doc.id} /><button className="btn">Mark read</button></form> : <span className="muted">Read</span>}</div>{doc.get("orderId") ? <Link className="btn" href={`/dashboard/orders/${doc.get("orderId")}`}>View order</Link> : null}</article>)}</div>{snapshot.size === 20 && last?.get("createdAt")?.toMillis?.() ? <Link className="btn" style={{ marginTop: 20 }} href={`/dashboard/notifications?after=${encodeURIComponent(encodeTimestampCursor({ millis: last.get("createdAt").toMillis(), id: last.id }))}`}>Next 20 notifications</Link> : null}</AppShell>;
}
