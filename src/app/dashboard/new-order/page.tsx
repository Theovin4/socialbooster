import { AppShell } from "@/components/app-shell";
import { NewOrderForm, type OrderService } from "@/components/new-order-form";
import { adminDb } from "@/lib/firebase/admin";
import { serviceSellingRateNgnMinor } from "@/lib/currency";
import { submitOrder } from "../orders/actions";

export const dynamic = "force-dynamic";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const { service } = await searchParams;
  const snapshot = await adminDb().collection("services").where("active", "==", true).get();
  const services: OrderService[] = snapshot.docs.map((doc) => { const item = doc.data(); return { id: doc.id, name: String(item.name), category: String(item.categoryName), min: Number(item.minQuantity), max: Number(item.maxQuantity), rateMinor: Number(serviceSellingRateNgnMinor(item)), refill: item.refillSupported === true, cancel: item.cancelSupported === true }; }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return <AppShell><span className="eyebrow">Order workspace</span><h1 className="page-heading">Create a new order</h1><p className="muted page-lead">Choose from the synchronized catalog, review service limits, and see the exact naira charge before submitting.</p><NewOrderForm services={services} selectedId={service} action={submitOrder} /></AppShell>;
}
