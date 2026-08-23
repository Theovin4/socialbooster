"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeDollarSign, ClipboardList, Headphones, Home, Layers3, LogOut, Menu, PlusCircle, ReceiptText, RefreshCcw, ShieldCheck, WalletCards, X } from "lucide-react";
import { Logo } from "./logo";

const customerLinks = [
  { label: "Overview", href: "/dashboard", icon: Home },
  { label: "New order", href: "/dashboard/new-order", icon: PlusCircle },
  { label: "Orders", href: "/dashboard/orders", icon: ClipboardList },
  { label: "Fund wallet", href: "/dashboard/wallet", icon: WalletCards },
  { label: "Transactions", href: "/dashboard/transactions", icon: ReceiptText },
  { label: "Mass order", href: "/dashboard/mass-order", icon: Layers3 },
  { label: "Refills", href: "/dashboard/refills", icon: RefreshCcw },
  { label: "Support", href: "/dashboard/support", icon: Headphones },
];

const adminLinks = [
  { label: "Overview", href: "/admin", icon: ShieldCheck },
  { label: "Services", href: "/admin/services", icon: Layers3 },
  { label: "Transactions", href: "/admin/transactions", icon: ReceiptText },
  { label: "Wallets", href: "/admin/wallets", icon: BadgeDollarSign },
  { label: "Support", href: "/admin/support", icon: Headphones },
];

export function AppShell({ admin = false, children }: { admin?: boolean; children: React.ReactNode }) {
  const pathname = usePathname(), router = useRouter(), [open, setOpen] = useState(false);
  const links = admin ? adminLinks : customerLinks;
  async function logout() { await fetch("/api/auth/session", { method: "DELETE" }); router.replace("/login?notice=signed-out"); router.refresh(); }
  const navigation = <><div className="portal-brand"><Logo /><span className="portal-role">{admin ? "Secure administration" : "Customer portal"}</span></div><nav className="portal-nav" aria-label={admin ? "Admin navigation" : "Customer navigation"}>{links.map(({ label, href, icon: Icon }) => { const active = pathname === href || (href !== (admin ? "/admin" : "/dashboard") && pathname.startsWith(`${href}/`)); return <Link key={href} href={href} onClick={() => setOpen(false)} className={`portal-link${active ? " active" : ""}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></Link>; })}</nav><div className="portal-sidebar-footer"><button className="portal-link portal-logout" onClick={logout}><LogOut size={18} /><span>Sign out</span></button><p>Your account session is protected.</p></div></>;

  return <div className="portal-layout"><aside className="portal-sidebar">{navigation}</aside><header className="portal-mobile-header"><Logo /><button className="icon-button" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button></header>{open ? <div className="portal-drawer-layer" role="dialog" aria-modal="true" aria-label="Navigation"><button className="portal-backdrop" onClick={() => setOpen(false)} aria-label="Close navigation" /><aside className="portal-drawer"><button className="icon-button portal-drawer-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X /></button>{navigation}</aside></div> : null}<main className="portal-content">{children}</main></div>;
}
