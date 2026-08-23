"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { reconcileFlutterwaveTransaction } from "@/lib/payments/credit";

const schema = z.object({ transactionId: z.coerce.number().int().positive() });

export async function reconcileFlutterwave(formData: FormData) {
  const admin = await requireAdmin();
  const { transactionId } = schema.parse(Object.fromEntries(formData));
  const verified = await reconcileFlutterwaveTransaction(transactionId, "admin_reconciliation");
  await adminDb().collection("paymentEvents").doc(`flutterwave:${transactionId}`).set({
    provider: "flutterwave", reference: verified.reference, providerTransactionId: String(transactionId),
    status: "admin_reconciled", reconciledBy: admin.uid, receivedAt: new Date(),
  }, { merge: true });
  revalidatePath("/admin/transactions");
  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard/transactions");
}
