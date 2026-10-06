"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/firebase/session";
import { setMarketingPreference } from "@/lib/marketing-profile";
import { marketingTopics } from "@/lib/marketing";

export async function updateEmailPreferences(formData: FormData) {
  const user = await requireUser();
  const subscribed = formData.get("marketing") === "on";
  const topics = Object.fromEntries(marketingTopics.map((topic) => [topic.id, subscribed && formData.get(`topic_${topic.id}`) === "on"]));
  try {
    await setMarketingPreference(user.uid, subscribed, "dashboard_preference_centre", topics);
    revalidatePath("/dashboard/preferences");
    redirect(`/dashboard/preferences?notice=${subscribed ? "subscribed" : "unsubscribed"}`);
  } catch (error) {
    console.error("[marketing-preferences] update failed", { userId: user.uid, error: error instanceof Error ? error.message : "Unknown error" });
    redirect("/dashboard/preferences?notice=paused");
  }
}
