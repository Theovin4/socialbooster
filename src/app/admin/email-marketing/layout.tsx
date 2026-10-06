import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/firebase/session";

const links = [
  ["Overview", "/admin/email-marketing"], ["Campaigns", "/admin/email-marketing/campaigns"], ["Create", "/admin/email-marketing/create"], ["Templates", "/admin/email-marketing/templates"], ["Audiences", "/admin/email-marketing/audiences"], ["Automations", "/admin/email-marketing/automations"], ["Analytics", "/admin/email-marketing/analytics"], ["Suppression", "/admin/email-marketing/suppression"], ["Preferences", "/admin/email-marketing/preferences"], ["Settings", "/admin/email-marketing/settings"],
] as const;

export default async function EmailMarketingLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <AppShell admin>
    <nav className="glass" aria-label="Email marketing sections" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 12, borderRadius: 16, marginBottom: 22 }}>
      {links.map(([label, href]) => <Link className="btn" href={href} key={href}>{label}</Link>)}
    </nav>
    {children}
  </AppShell>;
}
