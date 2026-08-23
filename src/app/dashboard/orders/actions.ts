"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/firebase/session";
import { createAndSubmitOrder, newOrderId } from "@/lib/orders";

const orderSchema = z.object({ serviceId: z.string().regex(/^\d+$/), link: z.string().url().max(2000), quantity: z.coerce.number().int().positive(), confirmed: z.literal("yes") });
export type OrderActionState = { status: "idle" | "error"; message: string };
export async function submitOrder(_previous: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const user = await requireUser();
  const parsed = orderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Review the service, target URL, quantity and confirmation, then try again." };
  let result: Awaited<ReturnType<typeof createAndSubmitOrder>>;
  try {
    result = await createAndSubmitOrder({ userId: user.uid, serviceId: parsed.data.serviceId, link: parsed.data.link, quantity: parsed.data.quantity, idempotencyKey: newOrderId() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order could not be submitted";
    if (message === "Insufficient wallet balance") return { status: "error", message: "Your wallet balance is too low for this order. Add funds and try again." };
    if (message === "This service requires a naira wallet") return { status: "error", message: "Your wallet must be in NGN before placing this order." };
    if (message === "Order submission is not enabled") return { status: "error", message: "Orders are temporarily unavailable. Please try again later." };
    return { status: "error", message: "We could not submit this order. Review the details and try again." };
  }
  redirect(`/dashboard/orders/${result.id}?notice=order-created`);
}
export async function submitMassOrders(formData: FormData) { const user = await requireUser(); if (formData.get("confirmed") !== "yes") throw new Error("Confirmation required"); const lines = String(formData.get("orders") || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean); if (!lines.length || lines.length > 10) throw new Error("Enter between 1 and 10 orders"); const ids: string[] = []; for (const line of lines) { const [serviceId, link, quantityText] = line.split("|").map((x) => x.trim()); const parsed = orderSchema.omit({ confirmed: true }).parse({ serviceId, link, quantity: quantityText }); const result = await createAndSubmitOrder({ userId: user.uid, ...parsed, idempotencyKey: newOrderId() }); ids.push(result.id); } redirect(`/dashboard/orders?submitted=${ids.length}`); }
