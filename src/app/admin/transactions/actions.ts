"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/firebase/session";
import { reconcileFlutterwaveTransaction } from "@/lib/payments/credit";
import { getFlutterwavePaymentDiagnostics } from "@/lib/payments/diagnostics-server";

const schema = z.object({ transactionId: z.coerce.number().int().positive() });
const diagnosticSchema = z.object({ query: z.string().trim().min(1).max(254) });

export async function reconcileFlutterwave(formData: FormData) {
  await requireAdmin();
  const { transactionId } = schema.parse(Object.fromEntries(formData));
  await reconcileFlutterwaveTransaction(transactionId, "admin_reconciliation");
  revalidatePath("/admin/transactions");
  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard/transactions");
}

export async function searchFlutterwavePayments(formData: FormData) {
  await requireAdmin();
  const parsed = diagnosticSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a Flutterwave transaction ID, payment reference, customer email, or user ID.", matches: [], truncated: false, message: null };
  const result = await getFlutterwavePaymentDiagnostics(parsed.data.query);
  return {
    error: result.error || null,
    matches: result.matches || [],
    truncated: result.truncated || false,
    message: result.message || null,
  };
}
