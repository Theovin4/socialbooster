import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Payment Methods for Social Media Services",
  description: "Learn how to fund a Social Booster wallet by available card, bank-transfer or supported cryptocurrency options, with payment verification and transaction history.",
  alternates: { canonical: "/payments" },
  openGraph: { title: "Social Booster Payment Methods", description: "Secure wallet funding with clear verification and transaction records.", url: "/payments" },
};

const methods = [
  { title: "Card and bank payment", text: "Use the payment options displayed in your authenticated wallet. The payment provider confirms a successful transaction before the wallet is credited." },
  { title: "Cryptocurrency", text: "Create a time-limited quote for a supported asset and network. Blockchain confirmation and an administrative review protect both the customer and the platform." },
  { title: "Wallet balance", text: "Verified deposits appear in your transaction history. Orders are charged from the wallet only after the price and quantity are confirmed." },
];

export default function PaymentsPage() {
  const schema = { "@context": "https://schema.org", "@type": "WebPage", name: "Social Booster payment methods", url: "https://www.socialbooster.net.ng/payments", about: { "@type": "Thing", name: "Online payment methods" } };
  return <><SiteHeader /><main className="shell" style={{ padding: "88px 0", minHeight: "65vh" }}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <span className="eyebrow">Wallet funding</span><h1 style={{ fontSize: "clamp(2.8rem,7vw,5.4rem)", letterSpacing: "-.055em", maxWidth: 980 }}>Choose an available payment method with confidence.</h1>
    <p className="muted page-lead">Your wallet shows the payment methods available to your account. Every credit has a transaction record and is verified before it can be used for an order.</p>
    <section className="grid3" style={{ marginTop: 38 }}>{methods.map((item) => <article className="glass card" key={item.title}><h2>{item.title}</h2><p className="muted" style={{ lineHeight: 1.75 }}>{item.text}</p></article>)}</section>
    <section className="glass card" style={{ marginTop: 24 }}><h2>Payment safety</h2><ul className="muted" style={{ lineHeight: 1.9 }}><li>Start every deposit from the signed-in wallet page.</li><li>Use the exact payment reference or crypto network shown in the quote.</li><li>Never share a card PIN, one-time password, account password or private wallet key.</li><li>Open a support ticket with the payment reference if a successful payment is not reflected.</li></ul></section>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}><Link className="btn primary" href="/register">Create an account</Link><Link className="btn" href="/payments/crypto">Read the crypto payment guide</Link><Link className="btn" href="/refund-policy">Refund policy</Link></div>
  </main><SiteFooter /></>;
}
