"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { verifyFlutterwaveTransaction } from "@/lib/payments/flutterwave";
import { creditVerifiedPayment } from "@/lib/payments/credit";
import { decimalToMinor } from "@/lib/money";

const schema = z.object({ transactionId: z.coerce.number().int().positive() });

export async function reconcileFlutterwave(formData: FormData) {
  const admin = await requireAdmin();
  const { transactionId } = schema.parse(Object.fromEntries(formData));
  const verified = await verifyFlutterwaveTransaction(transactionId);
  if (verified.status !== "successful") throw new Error("Flutterwave has not marked this transaction successful");
  await creditVerifiedPayment({
    provider: "flutterwave",
    reference: verified.tx_ref,
    providerTransactionId: String(transactionId),
    amountMinor: Number(decimalToMinor(String(verified.amount))),
    currency: verified.currency,
  });
  await adminDb().collection("paymentEvents").doc(`flutterwave:${transactionId}`).set({
    provider: "flutterwave", reference: verified.tx_ref, providerTransactionId: String(transactionId),
    status: "admin_reconciled", reconciledBy: admin.uid, receivedAt: new Date(),
  }, { merge: true });
  revalidatePath("/admin/transactions");
  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard/transactions");
}
