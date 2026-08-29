import { randomUUID } from "node:crypto";
import { z } from "zod";

const booleanFlag = z.union([z.boolean(), z.coerce.number().int().min(0).max(1).transform(Boolean)]);
const serviceSchema = z.object({
  service: z.coerce.number().int().positive(),
  name: z.string().min(1),
  type: z.string().min(1),
  rate: z.string().regex(/^\d+(\.\d+)?$/),
  min: z.coerce.number().int().nonnegative(),
  max: z.coerce.number().int().positive(),
  category: z.string().min(1),
  refill: booleanFlag,
  cancel: booleanFlag,
}).refine((value) => value.max >= value.min, "Maximum must be greater than or equal to minimum");
const statusSchema = z.object({ charge: z.string().optional(), start_count: z.string().optional(), status: z.string(), remains: z.string().optional(), currency: z.string().optional() });
const refillSchema = z.object({ refill: z.coerce.number().int().positive() });
const refillStatusSchema = z.object({ status: z.string().min(1) });
const multipleRefillSchema = z.union([
  z.array(z.object({ order: z.coerce.number().int().positive(), refill: z.coerce.number().int().positive().optional(), error: z.string().optional() })),
  z.record(z.string(), refillSchema.or(z.object({ error: z.string() }))),
]);
type Action = "services" | "add" | "status" | "refill" | "refill_status" | "cancel" | "balance";

export class ProviderError extends Error {
  constructor(message: string, public code = "PROVIDER_ERROR", public retryable = false, public requestId?: string) { super(message); }
}

export class FollowsPanelClient {
  private failures = 0;
  private blockedUntil = 0;
  constructor(private url = process.env.FOLLOWSPANEL_API_URL, private key = process.env.FOLLOWSPANEL_API_KEY) {}

  private async post(action: Action, input: Record<string, string> = {}, safeRetry = true) {
    if (!this.url || !this.key) throw new ProviderError("Provider credentials are not configured", "NOT_CONFIGURED");
    if (Date.now() < this.blockedUntil) throw new ProviderError("Provider circuit is temporarily open", "CIRCUIT_OPEN", true);
    const requestId = randomUUID();
    let last: unknown;
    const attempts = safeRetry ? 3 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(this.url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-request-id": requestId }, body: new URLSearchParams({ key: this.key, action, ...input }), signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new ProviderError(`Provider HTTP ${response.status}`, "HTTP", response.status >= 500, requestId);
        const data: unknown = await response.json();
        if (typeof data === "object" && data && "error" in data) throw new ProviderError(String((data as { error: unknown }).error), "UPSTREAM_REJECTED", false, requestId);
        this.failures = 0;
        return data;
      } catch (error) {
        last = error;
        this.failures += 1;
        if (this.failures >= 5) this.blockedUntil = Date.now() + 30_000;
        const retryable = error instanceof ProviderError ? error.retryable : true;
        if (!retryable || attempt === attempts - 1) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    if (last instanceof ProviderError) throw last;
    throw new ProviderError(last instanceof Error ? last.message : "Unknown provider error", "NETWORK", true, requestId);
  }

  services() { return this.post("services").then((data) => z.array(serviceSchema).parse(data)); }
  balance() { return this.post("balance").then((data) => z.object({ balance: z.string(), currency: z.string() }).parse(data)); }
  add(serviceId: number, link: string, quantity: number) { return this.post("add", { service: String(serviceId), link, quantity: String(quantity) }, false).then((data) => z.object({ order: z.coerce.number().int().positive() }).parse(data)); }
  status(orderId: number) { return this.post("status", { order: String(orderId) }).then((data) => statusSchema.parse(data)); }
  statuses(ids: number[]) { return this.post("status", { orders: ids.join(",") }).then((data) => {
    const source = z.record(z.string(), z.unknown()).parse(data), valid: Record<string, z.infer<typeof statusSchema>> = {};
    for (const [id, value] of Object.entries(source)) { const parsed = statusSchema.safeParse(value); if (parsed.success) valid[id] = parsed.data; }
    return valid;
  }); }
  refill(orderId: number) { return this.post("refill", { order: String(orderId) }, false).then((data) => refillSchema.parse(data)); }
  refills(orderIds: number[]) { return this.post("refill", { orders: orderIds.join(",") }, false).then((data) => multipleRefillSchema.parse(data)); }
  refillStatus(refillId: number) { return this.post("refill_status", { refill: String(refillId) }).then((data) => refillStatusSchema.parse(data)); }
  refillStatuses(ids: number[]) { return this.post("refill_status", { refills: ids.join(",") }).then((data) => z.record(z.string(), refillStatusSchema).parse(data)); }
  cancel(ids: number[]) { return this.post("cancel", { orders: ids.join(",") }, false).then((data) => {
    const rows = Array.isArray(data) ? data : data && typeof data === "object" ? Object.values(data) : [];
    return rows.map((row, index) => {
      const value = z.object({ order: z.coerce.number().int().positive().optional(), cancel: z.union([z.boolean(), z.coerce.number().int().min(0).transform(Boolean)]).optional(), error: z.string().optional() }).passthrough().parse(row);
      return { order: value.order || ids[index], accepted: value.cancel === true && !value.error, error: value.error };
    });
  }); }
}
