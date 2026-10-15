"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/firebase/session";
import {
  rebuildFinanceRollups,
  reconcileFinanceRollups,
} from "@/lib/firebase/finance-reconciliation";

export async function rebuildFinanceAction() {
  const admin = await requireAdmin();
  let result = "rebuilt";
  try {
    const repair = await rebuildFinanceRollups();
    const reconciliation = await reconcileFinanceRollups();
    result = reconciliation.status === "MATCH" ? "rebuilt" : "drift";
    console.info("[finance-repair] controlled rebuild completed", {
      actorUid: admin.uid,
      datesBackfilled: repair.datesBackfilled,
      orderDocumentsRead: repair.orderDocumentsRead,
      transactionDocumentsRead: repair.transactionDocumentsRead,
      writes: repair.writes,
      reconciliationStatus: reconciliation.status,
    });
  } catch (error) {
    result = "rebuild-failed";
    console.error("[finance-repair] controlled rebuild failed", {
      actorUid: admin.uid,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
  revalidatePath("/admin");
  revalidatePath("/admin/finance");
  redirect(`/admin/finance?repair=${result}`);
}

export async function reconcileFinanceAction() {
  const admin = await requireAdmin();
  let result = "matched";
  try {
    const reconciliation = await reconcileFinanceRollups();
    result = reconciliation.status === "MATCH" ? "matched" : "drift";
    console.info("[finance-repair] reconciliation completed", {
      actorUid: admin.uid,
      status: reconciliation.status,
    });
  } catch (error) {
    result = "reconciliation-failed";
    console.error("[finance-repair] reconciliation failed", {
      actorUid: admin.uid,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
  revalidatePath("/admin");
  revalidatePath("/admin/finance");
  redirect(`/admin/finance?repair=${result}`);
}
