import { AppShell } from "@/components/app-shell";
import { adminDb } from "@/lib/firebase/admin";
import { configuredUsdToNgnRateMicros, convertMinor } from "@/lib/currency";
import { formatMoney } from "@/lib/money";
import { submitOrder } from "../orders/actions";

export const dynamic = "force-dynamic";
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const { service: selected } = await searchParams, snapshot = await adminDb().collection("services").where("active", "==", true).limit(200).get();
  return <AppShell><span className="eyebrow">Secure NGN order</span><h1 style={{ fontSize: 42 }}>New order</h1><div className="glass card"><form action={submitOrder} style={{ display: "grid", gap: 14 }}><label>Service<select className="field" name="serviceId" defaultValue={selected} required><option value="">Select a service</option>{snapshot.docs.map((doc) => { const item = doc.data(), price = item.sellingCurrency === "NGN" ? item.sellingRateMinor : Number(convertMinor(BigInt(item.sellingRateMinor), configuredUsdToNgnRateMicros())); return <option value={doc.id} key={doc.id}>{item.name} — {formatMoney(BigInt(price), "NGN")}/1,000</option>; })}</select></label><label>Target URL<input className="field" name="link" type="url" placeholder="https://..." required /></label><label>Quantity<input className="field" name="quantity" type="number" min="1" required /></label><label style={{ display: "flex", gap: 10 }}><input type="checkbox" name="confirmed" value="yes" required /> I confirm the target and quantity are correct and permitted.</label><button className="btn primary">Place order in NGN</button></form></div></AppShell>;
}
