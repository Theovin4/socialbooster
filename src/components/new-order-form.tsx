"use client";

import { useActionState, useEffect, useState } from "react";
import { Calculator, CheckCircle2, Info, Link2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Toast } from "./toast";
import type { OrderActionState } from "@/app/dashboard/orders/actions";
import { trackAnalyticsEvent } from "@/lib/analytics";
import type { PublicServiceSemantics } from "@/lib/service-quality";

export type OrderService = { id: string; name: string; category: string; shortDescription: string; min: number; max: number; rateMinor: number; refill: boolean; cancel: boolean; semantics: PublicServiceSemantics };
type LoadedDetails = { fullDescription: string; descriptionSource: "provider" | "generated_fallback" };

export function NewOrderForm({ services, selectedId, action }: { services: OrderService[]; selectedId?: string; action: (previous: OrderActionState, formData: FormData) => Promise<OrderActionState> }) {
  const [serviceId, setServiceId] = useState(selectedId || "");
  const [quantity, setQuantity] = useState("");
  const [details, setDetails] = useState<LoadedDetails | null>(null);
  const [detailsStatus, setDetailsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [state, formAction, pending] = useActionState(action, { status: "idle", message: "" } as OrderActionState);
  const service = services.find((item) => item.id === serviceId);
  const numericQuantity = Number(quantity || 0);
  const charge = service && Number.isFinite(numericQuantity) ? Math.ceil(service.rateMinor * numericQuantity / 1000) : 0;
  const validQuantity = !!service && Number.isInteger(numericQuantity) && numericQuantity >= service.min && numericQuantity <= service.max;
  useEffect(() => { if (state.status === "error") trackAnalyticsEvent("order_failure", { reason: "validation_or_submission" }); }, [state.status]);
  useEffect(() => {
    setDetails(null);
    if (!serviceId) { setDetailsStatus("idle"); return; }
    const controller = new AbortController();
    setDetailsStatus("loading");
    fetch(`/api/public/services/${encodeURIComponent(serviceId)}/details`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Details unavailable"); return response.json() as Promise<LoadedDetails>; })
      .then((value) => { setDetails(value); setDetailsStatus("ready"); })
      .catch((error: unknown) => { if (error instanceof DOMException && error.name === "AbortError") return; setDetailsStatus("error"); });
    return () => controller.abort();
  }, [serviceId]);

  return <div className="glass card order-form-card">{state.status === "error" && state.message ? <Toast key={state.message} kind="error" title="Order not submitted" message={state.message} /> : null}<form action={formAction} className="order-form" onSubmit={() => { trackAnalyticsEvent("order_start", { service_id: serviceId }); trackAnalyticsEvent("begin_checkout", { currency: "NGN", value: charge / 100, items: service ? [{ item_id: service.id, item_name: service.name, item_category: service.category, quantity: numericQuantity, price: service.rateMinor / 100000 }] : [] }); }}>
    <div className="order-step"><span>1</span><div><strong>Choose a service</strong></div></div>
    <div className="form-grid">
      <label className="form-span">Service<select className="field" name="serviceId" value={serviceId} onChange={(event) => { const nextId = event.target.value; setServiceId(nextId); setQuantity(""); setDetails(null); setDetailsStatus(nextId ? "loading" : "idle"); if (nextId) { trackAnalyticsEvent("service_view", { service_id: nextId, surface: "new_order" }); trackAnalyticsEvent("select_item", { item_list_id: "new_order", items: [{ item_id: nextId }] }); } }} required><option value="">Choose from this page ({services.length.toLocaleString("en-NG")} available)</option>{services.map((item) => <option value={item.id} key={item.id}>{item.category} · {item.name} — {formatMoney(BigInt(item.rateMinor), "NGN")}/1,000</option>)}</select></label>
    </div>
    {service ? <section className="service-description" aria-live="polite" aria-busy={detailsStatus === "loading"}><div className="service-description-title"><Info size={20} /><div><span className="eyebrow">Service description</span><h2>{service.name}</h2></div></div>{detailsStatus === "loading" ? <p>Loading service description…</p> : null}{detailsStatus === "error" ? <p role="alert" className="form-error">Detailed service information is temporarily unavailable. Please try again before placing this order.</p> : null}{detailsStatus === "ready" && details ? <><p className="full-service-description">{details.fullDescription}</p>{details.descriptionSource === "generated_fallback" ? <p className="muted"><small>The provider did not supply additional details; this is an explicit factual fallback.</small></p> : null}</> : null}<dl><div><dt>Variant</dt><dd>{service.semantics.variant || "Standard"}</dd></div><div><dt>Target</dt><dd>{service.semantics.target || service.semantics.scope || "General content"}</dd></div><div><dt>Required link</dt><dd>{service.semantics.linkType}</dd></div><div><dt>Rate</dt><dd>{formatMoney(BigInt(service.rateMinor), "NGN")} / 1,000</dd></div><div><dt>Minimum</dt><dd>{service.min.toLocaleString("en-NG")}</dd></div><div><dt>Maximum</dt><dd>{service.max.toLocaleString("en-NG")}</dd></div><div><dt>Refill</dt><dd>{service.refill ? "Available" : "Not included"}</dd></div><div><dt>Cancellation</dt><dd>{service.cancel ? "When eligible" : "Not available"}</dd></div></dl></section> : null}
    <div className="order-step"><span>2</span><div><strong>Order details</strong></div></div>
    <div className="form-grid"><label><span className="label-with-icon"><Link2 size={17} /> Target URL</span><input className="field" name="link" type="url" placeholder="https://..." required disabled={!service} /></label><label>Quantity<input className="field" name="quantity" type="number" min={service?.min || 1} max={service?.max} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={service ? `${service.min} – ${service.max}` : "Select a service first"} required disabled={!service} /></label></div>
    <div className="order-summary"><div><span><Calculator size={17} /> Total charge</span><strong>{formatMoney(BigInt(Math.max(0, charge)), "NGN")}</strong></div></div>
    <label className="check-label"><input type="checkbox" name="confirmed" value="yes" required /> <span>I have checked the service, target URL and quantity. I understand that an order may not be changeable after submission.</span></label>
    <button className="btn primary order-submit" disabled={!service || detailsStatus !== "ready" || !validQuantity || pending}><CheckCircle2 size={18} /> {pending ? "Submitting order…" : "Place order"}</button>{service && quantity && !validQuantity ? <p role="alert" className="form-error">Quantity must be between {service.min.toLocaleString("en-NG")} and {service.max.toLocaleString("en-NG")}.</p> : null}
  </form></div>;
}
