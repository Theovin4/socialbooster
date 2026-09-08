"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/session";
import { generateCustomerApiKey, hashCustomerApiKey } from "@/lib/customer-api";

export type ApiKeyActionState = { status: "idle" | "success" | "error"; message: string; key?: string };

export async function createApiKey(_: ApiKeyActionState, formData: FormData): Promise<ApiKeyActionState> {
  const user = await requireUser();
  const label = String(formData.get("label") || "Primary key").trim().slice(0, 50) || "Primary key";
  const db = adminDb(), existing = await db.collection("customerApiKeys").where("userId", "==", user.uid).limit(10).get();
  if (existing.docs.filter((doc) => doc.get("status") === "active").length >= 3) return { status: "error", message: "Revoke an existing key before creating another one." };
  const key = generateCustomerApiKey(), hash = hashCustomerApiKey(key);
  await db.collection("customerApiKeys").doc(hash).create({ userId: user.uid, label, prefix: `${key.slice(0, 15)}…`, status: "active", createdAt: FieldValue.serverTimestamp(), lastUsedAt: null, rateWindowStart: 0, rateWindowCount: 0 });
  revalidatePath("/dashboard/api");
  return { status: "success", message: "Copy this key now. It will not be shown again.", key };
}

export async function revokeApiKey(formData: FormData) {
  const user = await requireUser(), id = String(formData.get("id") || "");
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid key reference");
  const ref = adminDb().collection("customerApiKeys").doc(id), snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get("userId") !== user.uid) throw new Error("API key not found");
  await ref.update({ status: "revoked", revokedAt: FieldValue.serverTimestamp() });
  revalidatePath("/dashboard/api");
}
