"use client";

import { useActionState, useEffect, useState } from "react";
import { Calculator, Check, CheckCircle2, ChevronDown, Info, Link2, Search, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Toast } from "./toast";
import type { OrderActionState } from "@/app/dashboard/orders/actions";
import { trackAnalyticsEvent } from "@/lib/analytics";
import type { PublicServiceSemantics } from "@/lib/service-quality";

export type OrderService = { id: string; name: string; category: string; min: number; max: number; rateMinor: number; refill: boolean; cancel: boolean; semantics: PublicServiceSemantics };
type LoadedDetails = { fullDescription: string; descriptionSource: "provider" | "generated_fallback" };
type PickerResponse = { items: OrderService[]; total: number };

export function NewOrderForm({ services, selectedId, action }: { services: OrderService[]; selectedId?: string; action: (previous: OrderActionState, formData: FormData) => Promise<OrderActionState> }) {
  const [service, setService] = useState<OrderService | null>(() => services.find((item) => item.id === selectedId) || null);
  const [quantity, setQuantity] = useState("");
  const [details, setDetails] = useState<LoadedDetails | null>(null);
  const [detailsStatus, setDetailsStatus] = useState<"idle" | "loading" | "ready" | "error">(selectedId ? "loading" : "idle");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pickerItems, setPickerItems] = useState<OrderService[]>(services);
  const [pickerTotal, setPickerTotal] = useState(services.length);
  const [pickerStatus, setPickerStatus] = useState<"ready" | "loading" | "error">("ready");
  const [state, formAction, pending] = useActionState(action, { status: "idle", message: "" } as OrderActionState);
  const serviceId = service?.id || "";
  const numericQuantity = Number(quantity || 0);
  const charge = service && Number.isFinite(numericQuantity) ? Math.ceil(service.rateMinor * numericQuantity / 1000) : 0;
  const validQuantity = !!service && Number.isInteger(numericQuantity) && numericQuantity >= service.min && numericQuantity <= service.max;

  useEffect(() => { if (state.status === "error") trackAnalyticsEvent("order_failure", { reason: "validation_or_submission" }); }, [state.status]);
  useEffect(() => {
    if (!serviceId) return;
    const controller = new AbortController();
    fetch(`/api/public/services/${encodeURIComponent(serviceId)}/details`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Details unavailable"); return response.json() as Promise<LoadedDetails>; })
      .then((value) => { setDetails(value); setDetailsStatus("ready"); })
      .catch((error: unknown) => { if (error instanceof DOMException && error.name === "AbortError") return; setDetailsStatus("error"); });
    return () => controller.abort();
  }, [serviceId]);
  useEffect(() => {
    if (!pickerOpen || !query.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/public/services?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then(async (response) => { if (!response.ok) throw new Error("Search unavailable"); return response.json() as Promise<PickerResponse>; })
        .then((value) => { setPickerItems(value.items); setPickerTotal(value.total); setPickerStatus("ready"); })
        .catch((error: unknown) => { if (error instanceof DOMException && error.name === "AbortError") return; setPickerStatus("error"); });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [pickerOpen, query]);
  useEffect(() => {
    if (!pickerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPickerOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [pickerOpen]);

  const openPicker = () => {
    setQuery("");
    setPickerItems(services);
    setPickerTotal(services.length);
    setPickerStatus("ready");
    setPickerOpen(true);
  };
  const chooseService = (item: OrderService) => {
    setService(item);
    setQuantity("");
    setDetails(null);
    setDetailsStatus("loading");
    setPickerOpen(false);
    trackAnalyticsEvent("service_view", { service_id: item.id, surface: "new_order" });
    trackAnalyticsEvent("select_item", { item_list_id: "new_order", items: [{ item_id: item.id, item_name: item.name }] });
  };

  return <div className="glass card order-form-card">{state.status === "error" && state.message ? <Toast key={state.message} kind="error" title="Order not submitted" message={state.message} /> : null}<form action={formAction} className="order-form" onSubmit={() => { trackAnalyticsEvent("order_start", { service_id: serviceId }); trackAnalyticsEvent("begin_checkout", { currency: "NGN", value: charge / 100, items: service ? [{ item_id: service.id, item_name: service.name, item_category: service.category, quantity: numericQuantity, price: service.rateMinor / 100000 }] : [] }); }}>
    <div className="order-step"><span>1</span><div><strong>Choose a service</strong></div></div>
    <div className="form-grid">
      <label className="form-span">Service<input type="hidden" name="serviceId" value={serviceId} required /><button className={`service-picker-trigger ${service ? "selected" : ""}`} type="button" onClick={openPicker} aria-haspopup="dialog"><span>{service ? <><small>{service.id}</small><strong>{service.name}</strong><em>{formatMoney(BigInt(service.rateMinor), "NGN")} per 1,000</em></> : <strong>Search and choose a service</strong>}</span><ChevronDown aria-hidden="true" size={22} /></button></label>
    </div>
    {service ? <section className="service-description" aria-live="polite" aria-busy={detailsStatus === "loading"}><div className="service-description-title"><Info size={20} /><div><span className="eyebrow">Service description</span><h2>{service.name}</h2></div></div>{detailsStatus === "loading" ? <p>Loading service description…</p> : null}{detailsStatus === "error" ? <p role="alert" className="form-error">Detailed service information is temporarily unavailable. Please try again before placing this order.</p> : null}{detailsStatus === "ready" && details ? <><p className="full-service-description">{details.fullDescription}</p>{details.descriptionSource === "generated_fallback" ? <p className="muted"><small>The provider did not supply additional details; this is an explicit factual fallback.</small></p> : null}</> : null}<dl><div><dt>Variant</dt><dd>{service.semantics.variant || "Standard"}</dd></div><div><dt>Target</dt><dd>{service.semantics.target || service.semantics.scope || "General content"}</dd></div><div><dt>Required link</dt><dd>{service.semantics.linkType}</dd></div><div><dt>Rate</dt><dd>{formatMoney(BigInt(service.rateMinor), "NGN")} / 1,000</dd></div><div><dt>Minimum</dt><dd>{service.min.toLocaleString("en-NG")}</dd></div><div><dt>Maximum</dt><dd>{service.max.toLocaleString("en-NG")}</dd></div><div><dt>Refill</dt><dd>{service.refill ? "Available" : "Not included"}</dd></div><div><dt>Cancellation</dt><dd>{service.cancel ? "When eligible" : "Not available"}</dd></div></dl></section> : null}
    <div className="order-step"><span>2</span><div><strong>Order details</strong></div></div>
    <div className="form-grid"><label><span className="label-with-icon"><Link2 size={17} /> Target URL</span><input className="field" name="link" type="url" placeholder="https://..." required disabled={!service} /></label><label>Quantity<input className="field" name="quantity" type="number" min={service?.min || 1} max={service?.max} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={service ? `${service.min} – ${service.max}` : "Select a service first"} required disabled={!service} /></label></div>
    <div className="order-summary"><div><span><Calculator size={17} /> Total charge</span><strong>{formatMoney(BigInt(Math.max(0, charge)), "NGN")}</strong></div></div>
    <label className="check-label"><input type="checkbox" name="confirmed" value="yes" required /> <span>I have checked the service, target URL and quantity. I understand that an order may not be changeable after submission.</span></label>
    <button className="btn primary order-submit" disabled={!service || detailsStatus !== "ready" || !validQuantity || pending}><CheckCircle2 size={18} /> {pending ? "Submitting order…" : "Place order"}</button>{service && quantity && !validQuantity ? <p role="alert" className="form-error">Quantity must be between {service.min.toLocaleString("en-NG")} and {service.max.toLocaleString("en-NG")}.</p> : null}
  </form>
  {pickerOpen ? <div className="service-picker-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}><section className="service-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="service-picker-title"><header><div><span className="eyebrow">Service catalogue</span><h2 id="service-picker-title">Choose a service</h2></div><button className="icon-button" type="button" onClick={() => setPickerOpen(false)} aria-label="Close service picker"><X /></button></header><div className="service-picker-search"><Search aria-hidden="true" size={20} /><input autoFocus type="search" value={query} onChange={(event) => { const value = event.target.value; setQuery(value); if (value.trim()) setPickerStatus("loading"); else { setPickerItems(services); setPickerTotal(services.length); setPickerStatus("ready"); } }} placeholder="Search service name or ID..." aria-label="Search service name or ID" /></div><p className="service-picker-count">{pickerStatus === "loading" ? "Searching…" : `${pickerTotal.toLocaleString("en-NG")} matching service${pickerTotal === 1 ? "" : "s"}${pickerTotal > pickerItems.length ? ` · showing first ${pickerItems.length}` : ""}`}</p><div className="service-picker-results" aria-live="polite" aria-busy={pickerStatus === "loading"}>{pickerStatus === "error" ? <p role="alert" className="service-picker-message">Search is temporarily unavailable. Please try again.</p> : null}{pickerStatus === "ready" && !pickerItems.length ? <p className="service-picker-message">No matching services. Try fewer words or a Social Booster ID.</p> : null}{pickerItems.map((item) => { const selected = item.id === serviceId; return <button className={`service-picker-result ${selected ? "selected" : ""}`} type="button" key={item.id} onClick={() => chooseService(item)}><span className="service-picker-result-id">{item.id}{selected ? <em><Check size={15} /> Selected</em> : null}</span><strong>{item.name}</strong><span className="service-picker-result-price">{formatMoney(BigInt(item.rateMinor), "NGN")} per 1,000</span><span className="service-picker-result-meta">Min {item.min.toLocaleString("en-NG")} · Max {item.max.toLocaleString("en-NG")} · {item.refill ? "Refill available" : "No refill"}</span></button>; })}</div></section></div> : null}
  </div>;
}
