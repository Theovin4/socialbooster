import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticateCustomerApi, CustomerApiError, hashCustomerApiKey } from "@/lib/customer-api";
import { adminDb } from "@/lib/firebase/admin";
import { createAndSubmitOrder } from "@/lib/orders";
import { serviceSellingRateNgnMinor } from "@/lib/currency";
import { customerOrderStatusLabel } from "@/lib/customer-order-status";

export const dynamic = "force-dynamic";
const addSchema = z.object({ service: z.coerce.string().regex(/^(?:\d+|(?:nitro|smmworld)_\d+)$/), link: z.string().url().max(2048), quantity: z.coerce.number().int().positive(), idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/).optional() });

async function input(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return z.record(z.string(), z.unknown()).parse(await request.json());
  const form = await request.formData(); return Object.fromEntries(form.entries());
}

const amount = (minor: number) => (minor / 100).toFixed(2);
export async function POST(request: Request) {
  try {
    const body = await input(request), action = String(body.action || "").toLowerCase();
    const auth = await authenticateCustomerApi(request, body.key);
    const db = adminDb();
    if (action === "services") {
      const snapshot = await db.collection("services").where("active", "==", true).limit(5000).get();
      return Response.json(snapshot.docs.map((doc) => { const service = doc.data(); return { service: doc.id, name: service.name, type: service.type, category: service.categoryName, rate: amount(Number(serviceSellingRateNgnMinor(service))), min: service.minQuantity, max: service.maxQuantity, refill: service.refillSupported === true, cancel: service.cancelSupported === true, currency: "NGN" }; }));
    }
    if (action === "balance") {
      const wallet = await db.collection("wallets").doc(auth.userId).get();
      return Response.json({ balance: amount(Number(wallet.get("availableMinor") ?? wallet.get("balanceMinor") ?? 0)), currency: String(wallet.get("currency") || "NGN") });
    }
    if (action === "add") {
      const parsed = addSchema.parse(body);
      const idempotencyKey = parsed.idempotency_key ? `api-${hashCustomerApiKey(`${auth.userId}:${parsed.idempotency_key}`).slice(0, 32)}` : randomUUID();
      const result = await createAndSubmitOrder({ userId: auth.userId, serviceId: parsed.service, link: parsed.link, quantity: parsed.quantity, idempotencyKey });
      return Response.json({ order: result.id, status: result.status });
    }
    if (action === "status") {
      const orderId = String(body.order || ""); if (!/^[A-Za-z0-9_-]{8,80}$/.test(orderId)) throw new CustomerApiError("Invalid order reference", 400, "invalid_order");
      const order = await db.collection("orders").doc(orderId).get();
      if (!order.exists || order.get("userId") !== auth.userId) throw new CustomerApiError("Order not found", 404, "order_not_found");
      const status = customerOrderStatusLabel(order.get("status")).toLowerCase().replaceAll(" ", "_");
      return Response.json({ order: order.id, charge: amount(Number(order.get("customerPriceMinor") || 0)), start_count: order.get("startCount") ?? null, status, remains: order.get("remains") ?? null, currency: order.get("currency") || "NGN" });
    }
    throw new CustomerApiError("Unsupported action", 400, "unsupported_action");
  } catch (error) {
    if (error instanceof CustomerApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid request", code: "invalid_request", details: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) }, { status: 400 });
    console.error("[customer-api] request failed", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "Request could not be completed", code: "internal_error" }, { status: 500 });
  }
}

export function GET() { return Response.json({ name: "Social Booster API", version: "v2", endpoint: "POST /api/v2", documentation: "/dashboard/api" }); }
