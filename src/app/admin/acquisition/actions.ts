"use server";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/session";
import { decimalToMinor } from "@/lib/money";

const rulesSchema = z.object({
  enabled: z.enum(["true", "false"]),
  rewardNgn: z.string().max(16).regex(/^\d+(\.\d{1,2})?$/),
  minimumFirstOrderNgn: z.string().max(16).regex(/^\d+(\.\d{1,2})?$/),
  qualificationDelayDays: z.coerce.number().int().min(0).max(90),
  monthlyRewardLimit: z.coerce.number().int().min(1).max(1_000),
});

export async function updateReferralRules(formData: FormData) {
  const admin = await requireAdmin();
  const input = rulesSchema.parse(Object.fromEntries(formData));
  const rewardMinor = Number(decimalToMinor(input.rewardNgn));
  const minimumFirstOrderMinor = Number(decimalToMinor(input.minimumFirstOrderNgn));
  if (!Number.isSafeInteger(rewardMinor) || !Number.isSafeInteger(minimumFirstOrderMinor)) throw new Error("Referral values are outside the supported range");
  const db = adminDb(), ref = db.collection("growthSettings").doc("referrals");
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const version = Number(current.get("version") || 0) + 1;
    transaction.set(ref, {
      enabled: input.enabled === "true",
      rewardMinor,
      minimumFirstOrderMinor,
      qualificationDelayDays: input.qualificationDelayDays,
      monthlyRewardLimit: input.monthlyRewardLimit,
      automaticWalletCredit: false,
      version,
      updatedBy: admin.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.create(db.collection("adminAuditLogs").doc(), {
      adminId: admin.uid,
      action: "referral_rules_updated",
      ruleVersion: version,
      automaticWalletCredit: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  revalidatePath("/admin/acquisition");
}

const rewardDecisionSchema = z.object({
  id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(5).max(300),
});

export async function reviewReferralReward(formData: FormData) {
  const admin = await requireAdmin();
  const input = rewardDecisionSchema.parse(Object.fromEntries(formData));
  const db = adminDb(), ref = db.collection("referralRewards").doc(input.id);
  await db.runTransaction(async (transaction) => {
    const reward = await transaction.get(ref);
    if (!reward.exists || reward.get("status") !== "pending_review") throw new Error("Referral reward is not pending review");
    const status = input.decision === "approve" ? "approved_manual_credit_required" : "rejected";
    transaction.set(ref, { status, reviewReason: input.reason, reviewedBy: admin.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(db.collection("referrals").doc(input.id), { rewardStatus: status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.create(db.collection("adminAuditLogs").doc(), { adminId: admin.uid, action: input.decision === "approve" ? "referral_reward_approved" : "referral_reward_rejected", rewardId: input.id, reason: input.reason, automaticWalletCredit: false, createdAt: FieldValue.serverTimestamp() });
  });
  revalidatePath("/admin/acquisition");
}
