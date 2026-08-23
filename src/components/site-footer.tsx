import Link from "next/link";
import { Logo } from "./logo";

const links = ["services", "pricing", "how-it-works", "africa", "blog", "about", "contact", "faq", "terms", "privacy", "refund-policy", "acceptable-use", "cookie-policy"];
export function SiteFooter() {
  return <footer style={{ borderTop: "1px solid var(--line)", padding: "52px 0 30px", marginTop: 80 }}><div className="shell"><div style={{ display: "flex", gap: 30, justifyContent: "space-between", flexWrap: "wrap" }}><div style={{ maxWidth: 390 }}><Logo /><p className="muted" style={{ lineHeight: 1.7 }}>A secure social media services marketplace for creators, growing brands, agencies and resellers across Nigeria and Africa.</p></div><div style={{ display: "flex", gap: 18, flexWrap: "wrap", maxWidth: 670 }}>{links.map((item) => <Link key={item} className="muted" href={`/${item}`}>{item.replaceAll("-", " ")}</Link>)}</div></div><p className="muted" style={{ borderTop: "1px solid var(--line)", paddingTop: 24, marginTop: 34, fontSize: 13 }}>© {new Date().getFullYear()} Social Booster. Service and payment availability varies by location and platform rules.</p></div></footer>;
}
