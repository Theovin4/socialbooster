import { currentUser } from "@/lib/firebase/session";
import { getOperationalTotals } from "@/lib/firebase/stats";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await currentUser(true);
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401, headers: privateHeaders });
  if (user.admin !== true) return Response.json({ error: "Administrator access required" }, { status: 403, headers: privateHeaders });

  try {
    const totals = await getOperationalTotals();
    return Response.json({
      totalCustomers: totals.totalCustomers,
      joinedToday: totals.joinedToday,
      totalOrders: totals.totalOrders,
      lastUpdated: totals.lastUpdated?.toISOString() || null,
      todayKey: totals.todayKey,
      dailyCustomerJoins: totals.dailyCustomerJoins,
    }, { headers: privateHeaders });
  } catch (error) {
    console.error("[admin-stats] unavailable", { error: error instanceof Error ? error.message : "Unknown error" });
    return Response.json({ error: "Administrative totals are temporarily unavailable" }, { status: 503, headers: privateHeaders });
  }
}
