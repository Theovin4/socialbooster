import { adminDb } from "@/lib/firebase/admin";
import { currentUser } from "@/lib/firebase/session";

type Attachment = { id?: string; name?: string; contentType?: string; size?: number };

export async function GET(_request: Request, { params }: { params: Promise<{ messageId: string; attachmentId: string }> }) {
  const user = await currentUser(true);
  if (!user) return new Response("Authentication required", { status: 401 });
  const { messageId, attachmentId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,180}$/.test(messageId) || !/^[a-f0-9-]{20,50}$/i.test(attachmentId)) return new Response("Attachment not found", { status: 404 });
  const message = await adminDb().collection("supportMessages").doc(messageId).get();
  if (!message.exists) return new Response("Attachment not found", { status: 404 });
  if (user.admin !== true && message.get("userId") !== user.uid) return new Response("Access denied", { status: 403 });
  const attachments = (Array.isArray(message.get("attachments")) ? message.get("attachments") : []) as Attachment[];
  const attachment = attachments.find((item) => item.id === attachmentId);
  const ticketId = String(message.get("ticketId") || "");
  if (!attachment || !ticketId) return new Response("Attachment not found", { status: 404 });
  const stored = await adminDb().collection("supportAttachments").doc(attachmentId).get();
  if (!stored.exists || stored.get("ticketId") !== ticketId || stored.get("messageId") !== messageId || stored.get("userId") !== message.get("userId")) return new Response("Attachment not found", { status: 404 });
  const contents = stored.get("bytes")?.toUint8Array?.() as Uint8Array | undefined;
  if (!contents) return new Response("Attachment not found", { status: 404 });
  const filename = String(stored.get("name") || attachment.name || "attachment").replace(/["\\\r\n]/g, "_");
  const body = contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength) as ArrayBuffer;
  return new Response(body, { headers: { "content-type": String(stored.get("contentType") || attachment.contentType || "application/octet-stream"), "content-length": String(contents.byteLength), "content-disposition": `attachment; filename="${filename}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
