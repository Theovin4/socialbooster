import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ProviderError } from "./followspanel";

const flag = z.union([z.boolean(), z.coerce.number().int().min(0).transform(Boolean)]).optional().default(false);
const serviceSchema = z.object({
  service: z.coerce.number().int().positive(),
  name: z.string().min(1),
  type: z.string().min(1),
  rate: z.coerce.string().regex(/^\d+(\.\d+)?$/),
  min: z.coerce.number().int().nonnegative(),
  max: z.coerce.number().int().positive(),
  category: z.string().min(1),
  description: z.string().optional(),
  refill: flag,
  cancel: flag,
}).refine((value) => value.max >= value.min, "Maximum must be greater than or equal to minimum");
const statusSchema = z.object({ charge: z.coerce.string().optional(), start_count: z.coerce.string().optional(), status: z.string(), remains: z.coerce.string().optional(), currency: z.string().optional() });
const refillSchema = z.object({ refill: z.coerce.number().int().positive() });
const refillStatusSchema = z.object({ status: z.string().min(1) });

export type StandardPanelEncoding = "form" | "json";
export type StandardPanelService = z.infer<typeof serviceSchema>;
export type StandardPanelStatus = z.infer<typeof statusSchema>;

export class StandardPanelClient {
  constructor(private url: string | undefined, private key: string | undefined, private encoding: StandardPanelEncoding) {}

  private async post(action: string, input: Record<string, string> = {}, safeRetry = true) {
    if (!this.url?.trim() || !this.key?.trim()) throw new ProviderError("Provider credentials are not configured", "NOT_CONFIGURED");
    const requestId = randomUUID();
    const payload = { key: this.key.trim(), action, ...input };
    let last: unknown;
    for (let attempt = 0; attempt < (safeRetry ? 3 : 1); attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(this.url.trim(), {
          method: "POST",
          headers: this.encoding === "json" ? { "content-type": "application/json", "x-request-id": requestId } : { "content-type": "application/x-www-form-urlencoded", "x-request-id": requestId },
          body: this.encoding === "json" ? JSON.stringify(payload) : new URLSearchParams(payload),
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new ProviderError(`Provider HTTP ${response.status}`, "HTTP", response.status >= 500, requestId);
        const data: unknown = await response.json();
        if (typeof data === "object" && data && "error" in data) throw new ProviderError(String((data as { error: unknown }).error), "UPSTREAM_REJECTED", false, requestId);
        return data;
      } catch (error) {
        last = error;
        const retryable = error instanceof ProviderError ? error.retryable : true;
        if (!retryable || attempt === (safeRetry ? 2 : 0)) break;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      } finally { clearTimeout(timer); }
    }
    if (last instanceof ProviderError) throw last;
    throw new ProviderError(last instanceof Error ? last.message : "Unknown provider error", "NETWORK", true, requestId);
  }

  services() { return this.post("services").then((data) => z.array(serviceSchema).parse(data)); }
  balance() { return this.post("balance").then((data) => z.object({ balance: z.coerce.string(), currency: z.string() }).parse(data)); }
  add(serviceId: number, link: string, quantity: number) { return this.post("add", { service: String(serviceId), link, quantity: String(quantity) }, false).then((data) => z.object({ order: z.coerce.number().int().positive() }).parse(data)); }
  status(orderId: number) { return this.post("status", { order: String(orderId) }).then((data) => statusSchema.parse(data)); }
  statuses(ids: number[]) { return this.post("status", { orders: ids.join(",") }).then((data) => {
    const source = z.record(z.string(), z.unknown()).parse(data), valid: Record<string, StandardPanelStatus> = {};
    for (const [id, value] of Object.entries(source)) { const parsed = statusSchema.safeParse(value); if (parsed.success) valid[id] = parsed.data; }
    return valid;
  }); }
  refill(orderId: number) { return this.post("refill", { order: String(orderId) }, false).then((data) => refillSchema.parse(data)); }
  refills(orderIds: number[]) { return this.post("refill", { orders: orderIds.join(",") }, false).then((data) => z.unknown().parse(data)); }
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
