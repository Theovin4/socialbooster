import { AppShell } from "@/components/app-shell";
import { NewOrderForm, type OrderService } from "@/components/new-order-form";
import { getActiveServiceCatalog } from "@/lib/service-catalog";
import { submitOrder } from "../orders/actions";

export const dynamic = "force-dynamic";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const { service } = await searchParams;
  const services: OrderService[] = (await getActiveServiceCatalog()).map((item) => ({ id: item.id, name: item.name, category: item.category, min: item.min, max: item.max, rateMinor: item.rateMinor, refill: item.refill, cancel: item.cancel, description: item.description }));
  return <AppShell><h1 className="page-heading">New order</h1><p className="muted page-lead">Choose a service and confirm your order.</p><NewOrderForm services={services} selectedId={service} action={submitOrder} /></AppShell>;
}
