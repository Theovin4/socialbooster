import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { evergreenSlugs, guides } from "@/lib/content";

export const metadata: Metadata = {
  title: "Social Media Marketing Guides for Nigeria",
  description: "Explore practical Instagram, TikTok, Facebook, YouTube, SEO and digital marketing guides for Nigerian creators and businesses.",
  alternates: { canonical: "/blog" },
};

export default function BlogPage() {
  return <><SiteHeader /><main className="shell" style={{ minHeight: "65vh", padding: "90px 0" }}>
    <span className="eyebrow">Nigeria marketing guides</span>
    <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)", letterSpacing: "-.055em" }}>Practical social media guidance.</h1>
    <p className="muted" style={{ fontSize: 19, maxWidth: 760, lineHeight: 1.7 }}>Explore {Object.keys(guides).length} clear, responsible guides for Nigerian creators and businesses building visibility, trust and sales online.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))", gap: 18, marginTop: 40 }}>
      {Object.entries(guides).map(([slug, item]) => <article className="glass card" key={slug} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <span className="eyebrow">{item.category}{(evergreenSlugs as readonly string[]).includes(slug) ? " · Evergreen" : ""}</span>
        <h2 style={{ fontSize: "clamp(1.35rem,3vw,1.75rem)" }}>{item.title}</h2>
        <p className="muted" style={{ flex: 1 }}>{item.description}</p>
        <Link className="btn" href={`/blog/${slug}`} aria-label={`Read ${item.title}`}>Read guide</Link>
      </article>)}
    </div>
  </main><SiteFooter /></>;
}
