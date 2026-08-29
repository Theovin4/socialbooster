import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Social Media Marketing Services in Nigeria",
  description: "Compare Instagram, TikTok, YouTube and Facebook marketing services in Nigerian naira. Secure payments and live order tracking for creators, brands and agencies.",
  alternates: { canonical: "/", languages: { "en-NG": "/", "x-default": "/" } },
  openGraph: { title: "Social Media Marketing Services in Nigeria", description: "Clear NGN prices, secure payments and accountable order tracking for Nigeria and Africa.", url: "/" },
};

const platforms = [
  { name: "Instagram", href: "/blog/instagram-marketing-nigeria" },
  { name: "TikTok", href: "/blog/tiktok-growth-nigeria" },
  { name: "YouTube", href: "/blog/youtube-marketing-nigeria" },
  { name: "Facebook", href: "/blog/facebook-marketing-nigeria" },
  { name: "X / Twitter", href: "/blog/x-twitter-marketing-nigeria" },
  { name: "WhatsApp", href: "/blog/whatsapp-business-marketing-nigeria" },
];
const benefits = [
  { title: "Clear prices before checkout", text: "Compare current prices, service limits and support options before spending from your wallet." },
  { title: "Secure online payments", text: "Payments are independently confirmed before funds appear in your account balance." },
  { title: "Everything in one dashboard", text: "Place orders, check progress, review transactions and request eligible support from any device." },
];
const faqs = [
  { question: "Are prices displayed in Nigerian naira?", answer: "Yes. Customer service prices, wallet balances and order charges are displayed in Nigerian naira so the total is clear before submission." },
  { question: "Can customers outside Nigeria use Social Booster?", answer: "Customers in supported African countries can create an account and browse services. Available payment methods depend on the customer's country, bank, card and the payment options enabled at checkout." },
  { question: "How can I track an order?", answer: "Every signed-in customer can open the order dashboard to review the live status, starting count, ordered quantity and remaining quantity when those details are available." },
  { question: "Does every service include refill or cancellation?", answer: "No. Refill and cancellation availability varies by service. Review the individual service description and support options before ordering." },
];

export default function Home() {
  const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) };
  return <><SiteHeader /><main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }} />
    <section className="shell" style={{ padding: "100px 0 70px", textAlign: "center" }}>
      <span className="eyebrow">Social media marketing services for Nigeria and Africa</span>
      <h1 style={{ fontSize: "clamp(3rem,8vw,6.8rem)", lineHeight: .93, letterSpacing: "-.065em", maxWidth: 1100, margin: "22px auto" }}>Build a stronger social presence<br /><span style={{ background: "linear-gradient(90deg,#58dcff,#9d83ff)", WebkitBackgroundClip: "text", color: "transparent" }}>with clear prices in naira.</span></h1>
      <p className="muted" style={{ fontSize: "clamp(1rem,2vw,1.25rem)", lineHeight: 1.7, maxWidth: 790, margin: "26px auto 34px" }}>Compare Instagram, TikTok, YouTube, Facebook and other social media marketing services. Pay securely and track every order from one professional dashboard.</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}><Link className="btn primary" href="/register">Create your free account →</Link><Link className="btn" href="/services">Browse services and prices</Link></div>
      <form action="/services" className="glass" style={{ maxWidth: 880, margin: "70px auto 0", padding: 12, borderRadius: 18, display: "flex", gap: 10 }}><input className="field" name="q" aria-label="Search social media services" placeholder="Search Instagram, TikTok, YouTube…" /><button className="btn primary">Search services</button></form>
    </section>
    <section className="shell" style={{ padding: "32px 0 75px" }}><h2 style={{ textAlign: "center", fontSize: 28 }}>Learn how to market on leading social platforms</h2><div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 22 }}>{platforms.map((platform) => <Link key={platform.name} href={platform.href} className="glass" style={{ padding: "13px 18px", borderRadius: 999, color: "#cbd7ee" }}>{platform.name}</Link>)}</div></section>
    <section className="shell" style={{ padding: "70px 0" }}><span className="eyebrow">Simple from start to finish</span><h2 style={{ fontSize: "clamp(2.2rem,5vw,4rem)", letterSpacing: "-.05em", maxWidth: 760, margin: "14px 0 36px" }}>Choose confidently. Pay securely. Follow every order.</h2><div className="grid3">{benefits.map((benefit, index) => <article key={benefit.title} className="card glass"><span style={{ color: "#5ddcff", fontWeight: 900 }}>0{index + 1}</span><h3 style={{ fontSize: 22 }}>{benefit.title}</h3><p className="muted" style={{ lineHeight: 1.7 }}>{benefit.text}</p></article>)}</div></section>
    <section className="shell glass" style={{ padding: "clamp(32px,6vw,70px)", borderRadius: 28, textAlign: "center" }}><span className="eyebrow">Built in Lagos, available across supported African markets</span><h2 style={{ fontSize: "clamp(2rem,5vw,3.8rem)", margin: 14 }}>One platform for ambitious African businesses.</h2><p className="muted" style={{ maxWidth: 760, marginInline: "auto", lineHeight: 1.7 }}>Creators, businesses, agencies and resellers can compare services and manage orders on desktop or mobile. Payment availability depends on the cards, banks, mobile-money methods and currencies enabled for each location.</p><Link className="btn primary" style={{ marginTop: 20 }} href="/africa">Explore availability across Africa</Link></section>
    <section className="shell" style={{ padding: "90px 0 20px" }}><span className="eyebrow">Frequently asked questions</span><h2 style={{ fontSize: "clamp(2.2rem,5vw,4rem)", letterSpacing: "-.04em" }}>What customers should know.</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 18 }}>{faqs.map((item) => <article className="glass card" key={item.question}><h3>{item.question}</h3><p className="muted" style={{ lineHeight: 1.75 }}>{item.answer}</p></article>)}</div><p style={{ marginTop: 24 }}><Link className="btn" href="/faq">Read all frequently asked questions</Link></p></section>
    <section className="shell" style={{ padding: "100px 0 30px", textAlign: "center" }}><h2 style={{ fontSize: "clamp(2.2rem,5vw,4rem)", letterSpacing: "-.04em" }}>Ready to reach more of your audience?</h2><p className="muted">Create an account, compare available services and see the exact charge before ordering.</p><Link className="btn primary" href="/register" style={{ marginTop: 20 }}>Get started today</Link></section>
  </main><SiteFooter /></>;
}
