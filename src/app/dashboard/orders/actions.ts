"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/firebase/session";
import { createAndSubmitOrder, newOrderId } from "@/lib/orders";

const orderSchema = z.object({ serviceId: z.string().regex(/^\d+$/), link: z.string().url().max(2000), quantity: z.coerce.number().int().positive(), confirmed: z.literal("yes") });
export async function submitOrder(formData: FormData) { const user = await requireUser(), input = orderSchema.parse(Object.fromEntries(formData)); const result = await createAndSubmitOrder({ userId: user.uid, serviceId: input.serviceId, link: input.link, quantity: input.quantity, idempotencyKey: newOrderId() }); redirect(`/dashboard/orders/${result.id}`); }
export async function submitMassOrders(formData: FormData) { const user = await requireUser(); if (formData.get("confirmed") !== "yes") throw new Error("Confirmation required"); const lines = String(formData.get("orders") || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean); if (!lines.length || lines.length > 10) throw new Error("Enter between 1 and 10 orders"); const ids: string[] = []; for (const line of lines) { const [serviceId, link, quantityText] = line.split("|").map((x) => x.trim()); const parsed = orderSchema.omit({ confirmed: true }).parse({ serviceId, link, quantity: quantityText }); const result = await createAndSubmitOrder({ userId: user.uid, ...parsed, idempotencyKey: newOrderId() }); ids.push(result.id); } redirect(`/dashboard/orders?submitted=${ids.length}`); }
