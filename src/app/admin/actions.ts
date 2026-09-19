"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/firebase/session";
import { sendRecentActivationEmails } from "@/lib/activation-campaign";

export async function sendActivationRecovery() {
  await requireAdmin();
  let result: Awaited<ReturnType<typeof sendRecentActivationEmails>>;
  try {
    result = await sendRecentActivationEmails();
  } catch (error) {
    console.error("[admin:activation-recovery] failed", { error: error instanceof Error ? error.message : "Unknown error" });
    redirect("/admin?activation=failed");
  }
  redirect(`/admin?activation=complete&sent=${result.sent}&skipped=${result.skipped}&failed=${result.failed}`);
}
