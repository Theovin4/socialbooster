import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { guides } from "@/lib/content";

export function generateStaticParams() {
  return Object.keys(guides).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = guides[slug];
  return item ? {
    title: item.title,
    description: item.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { type: "article", title: item.title, description: item.description, url: `/blog/${slug}` },
  } : { title: "Guide not found", robots: { index: false } };
}

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = guides[slug];
  if (!item) notFound();
  const related = item.related.map((relatedSlug) => [relatedSlug, guides[relatedSlug]] as const).filter((entry) => entry[1]);
  return <><SiteHeader /><main className="shell" style={{ minHeight: "65vh", padding: "90px 0", maxWidth: 900 }}>
    <Link href="/blog" className="muted">← All guides</Link>
    <p className="eyebrow" style={{ marginTop: 36 }}>{item.category} · Nigeria</p>
    <h1 style={{ fontSize: "clamp(2.6rem,7vw,5rem)", letterSpacing: "-.055em" }}>{item.title}</h1>
    <p className="muted" style={{ fontSize: 20, lineHeight: 1.8 }}>{item.description}</p>
    {item.sections.map((section) => <section key={section.heading} style={{ marginTop: 42 }}>
      <h2 style={{ fontSize: "clamp(1.65rem,4vw,2rem)" }}>{section.heading}</h2>
      <p className="muted" style={{ fontSize: 18, lineHeight: 1.9 }}>{section.body}</p>
    </section>)}
    <section className="glass card" style={{ marginTop: 50 }}>
      <span className="eyebrow">Continue learning</span><h2>Related marketing guides</h2>
      <div style={{ display: "grid", gap: 12 }}>{related.map(([relatedSlug, relatedGuide]) => <Link key={relatedSlug} href={`/blog/${relatedSlug}`}>{relatedGuide.title} →</Link>)}</div>
    </section>
    <div className="glass card" style={{ marginTop: 18 }}>
      <h2>Explore services in naira</h2>
      <p className="muted">Browse available social media services and review the current NGN price, minimum order and service details before ordering.</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><Link className="btn primary" href="/services">View services</Link><Link className="btn" href="/pricing">How pricing works</Link></div>
    </div>
  </main><SiteFooter /></>;
}
