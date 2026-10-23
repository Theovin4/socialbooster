import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/firebase/session";
import { SERVICE_DESCRIPTION_BACKFILL_CONFIRMATION } from "@/lib/service-description-backfill";

export const dynamic = "force-dynamic";

export default async function ServiceDescriptionMaintenancePage() {
  await requireAdmin();
  return <AppShell>
    <p className="eyebrow">Guarded maintenance</p>
    <h1 className="page-heading">Service description restoration</h1>
    <p className="muted page-lead">This tool calls provider catalogue read endpoints only. It cannot place an order, debit a wallet, process a payment, issue a refund, or change service pricing.</p>
    <section className="glass card" style={{ maxWidth: 820 }}>
      <h2>Step 1: calculate impact</h2>
      <p className="muted">Fetch current provider catalogues and calculate coverage, document writes, bytes and quality findings without writing any description document.</p>
      <form action="/api/admin/maintenance/service-descriptions" method="post">
        <input type="hidden" name="confirmation" value={SERVICE_DESCRIPTION_BACKFILL_CONFIRMATION} />
        <input type="hidden" name="dryRun" value="true" />
        <button className="btn primary" type="submit">Run description dry run</button>
      </form>
    </section>
    <section className="glass card" style={{ maxWidth: 820, marginTop: 20 }}>
      <h2>Step 2: restore descriptions</h2>
      <p className="muted">Run only after reviewing the dry-run result. Only missing or hash-changed public detail documents are written.</p>
      <form action="/api/admin/maintenance/service-descriptions" method="post">
        <input type="hidden" name="confirmation" value={SERVICE_DESCRIPTION_BACKFILL_CONFIRMATION} />
        <input type="hidden" name="dryRun" value="false" />
        <button className="btn" type="submit">Run description-only repair</button>
      </form>
    </section>
    <p style={{ marginTop: 22 }}><Link className="btn" href="/admin">Back to administration</Link></p>
  </AppShell>;
}
