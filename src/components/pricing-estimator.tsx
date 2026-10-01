"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calculator, CheckCircle2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { trackAnalyticsEvent } from "@/lib/analytics";

export type PricingService = {
  id: string;
  name: string;
  category: string;
  rateMinor: number;
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
};

export function PricingEstimator({ services }: { services: PricingService[] }) {
  const [serviceId, setServiceId] = useState(services[0]?.id || "");
  const service = services.find((item) => item.id === serviceId) || services[0];
  const [quantity, setQuantity] = useState(String(service?.min || 100));
  const numericQuantity = Number(quantity);
  const valid = !!service && Number.isInteger(numericQuantity) && numericQuantity >= service.min && numericQuantity <= service.max;
  const totalMinor = useMemo(() => valid && service ? Math.ceil(service.rateMinor * numericQuantity / 1000) : 0, [numericQuantity, service, valid]);

  if (!service) return <div className="glass card"><h2>Live price estimator</h2><p className="muted">Current catalogue prices are temporarily unavailable. Browse the catalogue and try again shortly.</p><Link className="btn primary" href="/services">Browse services</Link></div>;

  return <section className="glass pricing-estimator" aria-labelledby="price-estimator-title">
    <div><span className="eyebrow">Live estimator</span><h2 id="price-estimator-title">Calculate your order total</h2><p className="muted">Choose a current service and enter a quantity. The total shown is the same server-derived price used at checkout.</p></div>
    <div className="pricing-estimator-form">
      <label>Service<select className="field" value={service.id} onChange={(event) => { const next = services.find((item) => item.id === event.target.value); setServiceId(event.target.value); setQuantity(String(next?.min || 1)); trackAnalyticsEvent("service_view", { service_id: event.target.value, surface: "pricing_estimator" }); }}>{services.map((item) => <option key={item.id} value={item.id}>{item.category} · {item.name}</option>)}</select></label>
      <label>Quantity<input className="field" type="number" min={service.min} max={service.max} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      <div className="pricing-result"><span><Calculator size={18} /> Estimated total</span><strong>{valid ? formatMoney(BigInt(totalMinor), "NGN") : "Check quantity"}</strong><small>{formatMoney(BigInt(service.rateMinor), "NGN")} per 1,000 · Min {service.min.toLocaleString("en-NG")} · Max {service.max.toLocaleString("en-NG")}</small></div>
      <div className="pricing-support"><CheckCircle2 size={18} /><span>Refill {service.refill ? "available" : "not included"} · Cancellation {service.cancel ? "available when eligible" : "not available"}</span></div>
      <Link className="btn primary" href={`/dashboard/new-order?service=${service.id}`}>Continue with this service</Link>
    </div>
  </section>;
}
