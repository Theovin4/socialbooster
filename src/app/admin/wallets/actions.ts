"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/firebase/session";
import { adminAuth } from "@/lib/firebase/admin";
import { decimalToMinor } from "@/lib/money";
import { postWallet } from "@/lib/firebase/wallet";

const adjustment = z.object({ userId: z.string().min(6).max(128), amount: z.string().regex(/^\d+(\.\d{1,2})?$/), direction: z.enum(["credit", "debit"]), currency: z.enum(["USD", "GBP", "EUR", "NGN", "CAD", "AUD"]), reason: z.string().trim().min(5).max(300) });
export async function adjustWallet(formData: FormData) {
  const admin = await requireAdmin();
  const input = adjustment.parse(Object.fromEntries(formData));
  await adminAuth().getUser(input.userId);
  const amount = Number(decimalToMinor(input.amount));
  await postWallet({ userId: input.userId, type: "admin_adjustment", deltaMinor: input.direction === "credit" ? amount : -amount, currency: input.currency, reason: input.reason, actorUid: admin.uid, idempotencyKey: `admin:${admin.uid}:${randomUUID()}` });
  revalidatePath("/admin/wallets"); revalidatePath("/admin/transactions"); revalidatePath("/dashboard/wallet"); revalidatePath("/dashboard/transactions");
}
