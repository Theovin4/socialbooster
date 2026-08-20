import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { guides } from "@/lib/content";
export const metadata: Metadata = { title: "Social Media Marketing Guides for Nigeria", description: "Practical Instagram, TikTok and social media marketing guides for Nigerian creators, businesses and resellers.", alternates: { canonical: "/blog" } };
export default function BlogPage() { return <><SiteHeader /><main className="shell" style={{ minHeight: "65vh", padding: "90px 0" }}><span className="eyebrow">Nigeria marketing guides</span><h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)", letterSpacing: "-.055em" }}>Practical social media guidance.</h1><p className="muted" style={{ fontSize: 19, maxWidth: 760, lineHeight: 1.7 }}>Clear, responsible advice for Nigerian creators and businesses building visibility online.</p><div style={{ display: "grid", gap: 16, marginTop: 40 }}>{Object.entries(guides).map(([slug, guide]) => <article className="glass card" key={slug}><h2>{guide.title}</h2><p className="muted">{guide.description}</p><Link className="btn" href={`/blog/${slug}`}>Read guide</Link></article>)}</div></main><SiteFooter /></>; }
