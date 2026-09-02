import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";

export type SupportAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
};

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]);
const maxFiles = 3;
const maxFileBytes = 700 * 1024;
const maxTotalBytes = 2 * 1024 * 1024;
const safeExtensions: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf", "text/plain": ".txt" };

function matchesSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (type === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (type === "application/pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (type === "text/plain") return !bytes.slice(0, 1024).includes(0);
  return false;
}

export async function validateSupportFiles(formData: FormData) {
  const files = formData.getAll("attachments").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length > maxFiles) throw new Error(`Attach no more than ${maxFiles} files.`);
  if (files.some((file) => file.size > maxFileBytes)) throw new Error("Each attachment must be 700 KB or less.");
  if (files.reduce((sum, file) => sum + file.size, 0) > maxTotalBytes) throw new Error("Attachments must be 2 MB or less in total.");
  const checked: Array<{ file: File; bytes: Uint8Array }> = [];
  for (const file of files) {
    if (!allowedTypes.has(file.type)) throw new Error("Only JPG, PNG, WebP, PDF and TXT files are accepted.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesSignature(file.type, bytes)) throw new Error(`The contents of ${file.name || "an attachment"} do not match its file type.`);
    checked.push({ file, bytes });
  }
  return checked;
}

export async function storeSupportFiles(ticketId: string, messageId: string, userId: string, files: Awaited<ReturnType<typeof validateSupportFiles>>) {
  if (!files.length) return [] as SupportAttachment[];
  const collection = adminDb().collection("supportAttachments");
  const stored: SupportAttachment[] = [];
  try {
    for (const { file, bytes } of files) {
      const id = randomUUID();
      const baseName = (file.name || "attachment").replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "attachment";
      const cleanName = `${baseName}${safeExtensions[file.type]}`;
      await collection.doc(id).create({ ticketId, messageId, userId, name: cleanName, contentType: file.type, size: file.size, bytes: Buffer.from(bytes), createdAt: new Date() });
      stored.push({ id, name: cleanName, contentType: file.type, size: file.size });
    }
    return stored;
  } catch (error) {
    await Promise.all(stored.map((attachment) => collection.doc(attachment.id).delete().catch(() => undefined)));
    throw error;
  }
}
