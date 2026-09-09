"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useState } from "react";
import { Headphones, MessageCircle, Send, X } from "lucide-react";
import { Logo } from "./logo";

const quickActions = [
  { label: "Choose a service", href: "/services" },
  { label: "Track an order", href: "/dashboard/orders" },
  { label: "Payment help", href: "/dashboard/wallet" },
  { label: "Contact support", href: "/dashboard/support" },
];

export function SupportAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setMessage(value.slice(0, 1000));
    setDraft("");
  }

  return <aside className={`support-assistant${open ? " is-open" : ""}`} aria-label="Social Booster support assistant">
    {open ? <section className="support-assistant-panel" role="dialog" aria-modal="false" aria-labelledby="support-assistant-title">
      <header className="support-assistant-header"><div><Logo /><strong id="support-assistant-title">Support assistant</strong><span>Guidance when you need it</span></div><button type="button" onClick={() => setOpen(false)} aria-label="Close support assistant"><X size={21} /></button></header>
      <div className="support-assistant-body">
        <div className="support-assistant-message"><Headphones size={20} /><p>Welcome to Social Booster support. Choose an option below, or describe what you need help with.</p></div>
        <nav className="support-assistant-actions" aria-label="Support options">{quickActions.map((action) => <Link href={action.href} key={action.href} onClick={() => setOpen(false)}>{action.label}</Link>)}</nav>
        {message ? <div className="support-assistant-reply"><p>For your security, send account-specific details through your private support inbox. Your message is ready to review there.</p><Link className="btn primary" href={`/dashboard/support?draft=${encodeURIComponent(message)}`} onClick={() => setOpen(false)}>Continue to support</Link></div> : null}
      </div>
      <form className="support-assistant-form" onSubmit={submit}><label className="sr-only" htmlFor="support-assistant-message">Describe what you need help with</label><input id="support-assistant-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} placeholder="How can we help?" /><button type="submit" aria-label="Send message"><Send size={19} /></button></form>
    </section> : null}
    <button className="support-assistant-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Close support assistant" : "Open support assistant"}>{open ? <X size={26} /> : <MessageCircle size={26} />}</button>
  </aside>;
}
