"use client";

import { useActionState, useMemo, useState } from "react";
import { Calculator, CheckCircle2, Link2, Search } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Toast } from "./toast";
import type { OrderActionState } from "@/app/dashboard/orders/actions";

export type OrderService = { id: string; name: string; category: string; min: number; max: number; rateMinor: number; refill: boolean; cancel: boolean };

export function NewOrderForm({ services, selectedId, action }: { services: OrderService[]; selectedId?: string; action: (previous: OrderActionState, formData: FormData) => Promise<OrderActionState> }) {
  const [query, setQuery] = useState(""), [serviceId, setServiceId] = useState(selectedId || ""), [quantity, setQuantity] = useState("");
  const [state, formAction, pending] = useActionState(action, { status: "idle", message: "" } as OrderActionState);
  const filtered = useMemo(() => { const value = query.trim().toLowerCase(); return value ? services.filter((item) => `${item.category} ${item.name} ${item.id}`.toLowerCase().includes(value)) : services; }, [query, services]);
  const service = services.find((item) => item.id === serviceId);
  const numericQuantity = Number(quantity || 0);
  const charge = service && Number.isFinite(numericQuantity) ? Math.ceil(service.rateMinor * numericQuantity / 1000) : 0;
  const validQuantity = !!service && Number.isInteger(numericQuantity) && numericQuantity >= service.min && numericQuantity <= service.max;

  return <div className="glass card">{state.status === "error" && state.message ? <Toast key={state.message} kind="error" title="Order not submitted" message={state.message} /> : null}<form action={formAction} className="form-grid">
    <label className="form-span">Search services<div style={{ position: "relative", marginTop: 8 }}><Search size={18} style={{ position: "absolute", left: 15, top: 16, color: "#7890b4" }} /><input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search platform, category, service name or ID" style={{ paddingLeft: 44 }} /></div></label>
    <label className="form-span">Service<select className="field" name="serviceId" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setQuantity(""); }} required style={{ marginTop: 8 }}><option value="">Choose a service ({filtered.length.toLocaleString("en-NG")} available)</option>{filtered.map((item) => <option value={item.id} key={item.id}>{item.category} · {item.name} — {formatMoney(BigInt(item.rateMinor), "NGN")}/1,000</option>)}</select></label>
    {service ? <div className="form-span notice"><div className="section-head" style={{ marginBottom: 8 }}><div><span className="eyebrow">Service {service.id}</span><strong style={{ display: "block", fontSize: 18, marginTop: 7 }}>{service.name}</strong></div><strong>{formatMoney(BigInt(service.rateMinor), "NGN")} / 1,000</strong></div><p className="muted" style={{ margin: 0 }}>Use the direct public URL for the selected platform. Minimum {service.min.toLocaleString("en-NG")}; maximum {service.max.toLocaleString("en-NG")}. Refill {service.refill ? "available" : "not included"}; cancellation {service.cancel ? "supported when eligible" : "not supported"}.</p></div> : null}
    <label><span style={{ display: "flex", alignItems: "center", gap: 7 }}><Link2 size={17} /> Target URL</span><input className="field" name="link" type="url" placeholder="https://..." required style={{ marginTop: 8 }} /></label>
    <label>Quantity<input className="field" name="quantity" type="number" min={service?.min || 1} max={service?.max} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={service ? `${service.min} – ${service.max}` : "Select a service first"} required disabled={!service} style={{ marginTop: 8 }} /></label>
    <div className="form-span glass card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap", boxShadow: "none" }}><div><span className="muted" style={{ display: "flex", alignItems: "center", gap: 7 }}><Calculator size={17} /> Calculated charge</span><strong className="stat-value">{formatMoney(BigInt(Math.max(0, charge)), "NGN")}</strong></div><span className="muted">Price updates automatically from your quantity.</span></div>
    <label className="form-span" style={{ display: "flex", gap: 10, alignItems: "flex-start", lineHeight: 1.5 }}><input type="checkbox" name="confirmed" value="yes" required style={{ marginTop: 4 }} /> I confirm the target URL, service, and quantity are correct. Orders cannot always be changed after provider submission.</label>
    <div className="form-span"><button className="btn primary" disabled={!service || !validQuantity || pending}><CheckCircle2 size={18} /> {pending ? "Submitting order…" : "Place secure NGN order"}</button>{service && quantity && !validQuantity ? <p role="alert" style={{ color: "#fbbf84" }}>Quantity must be between {service.min.toLocaleString("en-NG")} and {service.max.toLocaleString("en-NG")}.</p> : null}</div>
  </form></div>;
}
