"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/firebase/session";
import { createAndSubmitOrder, newOrderId } from "@/lib/orders";
import { resolveServiceIdentifier } from "@/lib/service-catalog";
import { adminDb } from "@/lib/firebase/admin";
import { serviceCostMinor } from "@/lib/money";
import { parseMassOrderLines } from "@/lib/mass-orders";

const orderSchema = z.object({ serviceId: z.string().min(3).max(160), link: z.string().url().max(2000), quantity: z.coerce.number().int().positive(), confirmed: z.literal("yes") });
export type OrderActionState = { status: "idle" | "error"; message: string };
export async function submitOrder(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const user = await requireUser();
  const parsed = orderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Review the service, target URL, quantity and confirmation, then try again." };
  const service = await resolveServiceIdentifier(parsed.data.serviceId);
  if (!service) return { status: "error", message: "This service is no longer available. Choose another service and try again." };
  let result: Awaited<ReturnType<typeof createAndSubmitOrder>>;
  try {
    result = await createAndSubmitOrder({ userId: user.uid, serviceId: service.internalId, link: parsed.data.link, quantity: parsed.data.quantity, idempotencyKey: newOrderId() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order could not be submitted";
    if (message === "Insufficient wallet balance") return { status: "error", message: "Your wallet balance is too low for this order. Add funds and try again." };
    if (message === "This service requires a naira wallet") return { status: "error", message: "Your wallet must be in NGN before placing this order." };
    if (message === "Order submission is not enabled") return { status: "error", message: "Orders are temporarily unavailable. Please try again later." };
    return { status: "error", message: "We could not submit this order. Review the details and try again." };
  }
  if (result.status === "failed") return { status: "error", message: "This service is temporarily unavailable. Your wallet was refunded automatically; please choose another service or try again later." };
  if (result.status === "provider_confirmation_required") redirect(`/dashboard/orders/${result.id}?notice=order-review`);
  redirect(`/dashboard/orders/${result.id}?notice=order-created`);
}
export async function submitMassOrders(formData: FormData) {
  const user = await requireUser();
  if (formData.get("confirmed") !== "yes") throw new Error("Confirmation required");
  const batchId = String(formData.get("batchId") || "");
  if (!/^[a-f0-9-]{36}$/i.test(batchId)) throw new Error("Invalid batch reference");
  const rows = parseMassOrderLines(String(formData.get("orders") || ""));
  const resolved = await Promise.all(rows.map(async (row, index) => {
    const service = await resolveServiceIdentifier(row.serviceId);
    if (!service) throw new Error(`Line ${index + 1}: service is unavailable`);
    if (row.quantity < service.min || row.quantity > service.max) throw new Error(`Line ${index + 1}: quantity must be between ${service.min} and ${service.max}`);
    return { ...row, service, chargeMinor: Number(serviceCostMinor(BigInt(service.rateMinor), BigInt(row.quantity))) };
  }));
  const wallet = await adminDb().collection("wallets").doc(user.uid).get();
  const currency = String(wallet.get("currency") || "NGN"), available = Number(wallet.get("availableMinor") ?? wallet.get("balanceMinor") ?? 0);
  const total = resolved.reduce((sum, row) => sum + row.chargeMinor, 0);
  if (currency !== "NGN") throw new Error("Your wallet must be in NGN before placing this batch");
  if (available < total) throw new Error("Your wallet balance is too low for this batch");
  const results: Array<Awaited<ReturnType<typeof createAndSubmitOrder>>> = [];
  let failed = 0;
  for (const [index, row] of resolved.entries()) {
    try {
      results.push(await createAndSubmitOrder({ userId: user.uid, serviceId: row.service.internalId, link: row.link, quantity: row.quantity, idempotencyKey: `mass-${batchId}-${index}` }));
    } catch (error) {
      failed += 1;
      console.warn("[mass-order] row submission failed", { batchId, row: index + 1, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  const attention = results.filter((result) => ["failed", "provider_confirmation_required"].includes(result.status)).length;
  redirect(`/dashboard/orders?submitted=${results.length}&attention=${attention}&failed=${failed}`);
}
