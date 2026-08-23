"use client";

import { useActionState, useMemo, useState } from "react";
import { Calculator, CheckCircle2, Info, Link2, Search } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Toast } from "./toast";
import type { OrderActionState } from "@/app/dashboard/orders/actions";

export type OrderService = { id: string; name: string; category: string; description: string; min: number; max: number; rateMinor: number; refill: boolean; cancel: boolean };

function serviceDescription(service: OrderService) {
  if (service.description.trim()) return service.description.trim();
  const terms = service.name.toLowerCase();
  const target = terms.includes("youtube") ? "YouTube video or channel" : terms.includes("instagram") ? "Instagram post, reel or profile" : terms.includes("tiktok") ? "TikTok video or profile" : terms.includes("facebook") ? "Facebook post, page or profile" : terms.includes("telegram") ? "Telegram channel or post" : terms.includes("twitter") || terms.includes(" x ") ? "X profile or post" : "public social-media page or post";
  return `Submit the direct public URL for the relevant ${target}. This service accepts between ${service.min.toLocaleString("en-NG")} and ${service.max.toLocaleString("en-NG")} units per order. ${service.refill ? "Refill support is available when the service conditions are met." : "Refill is not included."} ${service.cancel ? "Eligible orders may be cancelled before processing is completed." : "Orders cannot be cancelled after submission."}`;
}

export function NewOrderForm({ services, selectedId, action }: { services: OrderService[]; selectedId?: string; action: (previous: OrderActionState, formData: FormData) => Promise<OrderActionState> }) {
  const selected = services.find((item) => item.id === selectedId);
  const [category, setCategory] = useState(selected?.category || "");
  const [serviceId, setServiceId] = useState(selectedId || "");
  const [query, setQuery] = useState("");
  const [quantity, setQuantity] = useState("");
  const [state, formAction, pending] = useActionState(action, { status: "idle", message: "" } as OrderActionState);
  const categories = useMemo(() => Array.from(new Set(services.map((item) => item.category))).sort((a, b) => a.localeCompare(b)), [services]);
  const categoryServices = useMemo(() => {
    const value = query.trim().toLowerCase();
    return services.filter((item) => item.category === category && (!value || `${item.name} ${item.id}`.toLowerCase().includes(value)));
  }, [category, query, services]);
  const service = services.find((item) => item.id === serviceId);
  const numericQuantity = Number(quantity || 0);
  const charge = service && Number.isFinite(numericQuantity) ? Math.ceil(service.rateMinor * numericQuantity / 1000) : 0;
  const validQuantity = !!service && Number.isInteger(numericQuantity) && numericQuantity >= service.min && numericQuantity <= service.max;

  return <div className="glass card order-form-card">{state.status === "error" && state.message ? <Toast key={state.message} kind="error" title="Order not submitted" message={state.message} /> : null}<form action={formAction} className="order-form">
    <div className="order-step"><span>1</span><div><strong>Choose your service</strong><p>Select a category first, then choose the exact service you need.</p></div></div>
    <div className="form-grid">
      <label>Category<select className="field" value={category} onChange={(event) => { setCategory(event.target.value); setServiceId(""); setQuantity(""); setQuery(""); }} required><option value="">Select a category</option>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      <label>Find a service<div className="field-with-icon"><Search size={18} /><input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={category ? "Search this category" : "Choose a category first"} disabled={!category} /></div></label>
      <label className="form-span">Service<select className="field" name="serviceId" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setQuantity(""); }} required disabled={!category}><option value="">{category ? `Choose a service (${categoryServices.length.toLocaleString("en-NG")} available)` : "Choose a category first"}</option>{categoryServices.map((item) => <option value={item.id} key={item.id}>{item.name} — {formatMoney(BigInt(item.rateMinor), "NGN")}/1,000</option>)}</select></label>
    </div>
    {service ? <section className="service-description" aria-live="polite"><div className="service-description-title"><Info size={20} /><div><span className="eyebrow">Service description</span><h2>{service.name}</h2></div></div><p>{serviceDescription(service)}</p><dl><div><dt>Rate</dt><dd>{formatMoney(BigInt(service.rateMinor), "NGN")} / 1,000</dd></div><div><dt>Minimum</dt><dd>{service.min.toLocaleString("en-NG")}</dd></div><div><dt>Maximum</dt><dd>{service.max.toLocaleString("en-NG")}</dd></div><div><dt>Refill</dt><dd>{service.refill ? "Available" : "Not included"}</dd></div></dl></section> : null}
    <div className="order-step"><span>2</span><div><strong>Enter the order details</strong><p>Use the correct public link and a quantity within the service limits.</p></div></div>
    <div className="form-grid"><label><span className="label-with-icon"><Link2 size={17} /> Target URL</span><input className="field" name="link" type="url" placeholder="https://..." required disabled={!service} /></label><label>Quantity<input className="field" name="quantity" type="number" min={service?.min || 1} max={service?.max} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={service ? `${service.min} – ${service.max}` : "Select a service first"} required disabled={!service} /></label></div>
    <div className="order-summary"><div><span><Calculator size={17} /> Total charge</span><strong>{formatMoney(BigInt(Math.max(0, charge)), "NGN")}</strong></div><p>The exact charge updates automatically as you enter your quantity.</p></div>
    <label className="check-label"><input type="checkbox" name="confirmed" value="yes" required /> <span>I have checked the service, target URL and quantity. I understand that an order may not be changeable after submission.</span></label>
    <button className="btn primary order-submit" disabled={!service || !validQuantity || pending}><CheckCircle2 size={18} /> {pending ? "Submitting order…" : "Place order"}</button>{service && quantity && !validQuantity ? <p role="alert" className="form-error">Quantity must be between {service.min.toLocaleString("en-NG")} and {service.max.toLocaleString("en-NG")}.</p> : null}
  </form></div>;
}
