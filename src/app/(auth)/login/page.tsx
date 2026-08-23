import Link from "next/link";
import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";

export default async function Login({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const initialNotice = notice === "verify-email" ? { kind: "success" as const, title: "Account created — verify your email", message: "Open the activation message and click the verification link. Check Spam, Junk or Promotions if it is not in your Inbox, then mark it as Not spam." } : notice === "reset-sent" ? { kind: "success" as const, title: "Check your email", message: "If the address matches an account, a reset link was sent. Check Spam, Junk or Promotions if it is not in your Inbox." } : notice === "signed-out" ? { kind: "success" as const, title: "Signed out", message: "You have been signed out securely." } : undefined;
  return <main className="shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "40px 0" }}><section className="glass card" style={{ width: "min(440px,100%)" }}><Logo /><span className="eyebrow" style={{ display: "block", marginTop: 32 }}>Secure account access</span><h1 style={{ fontSize: 36, marginBottom: 8 }}>Welcome back</h1><p className="muted">Sign in to manage your wallet and orders.</p><AuthForm mode="login" initialNotice={initialNotice} /><p className="muted"><Link href="/forgot-password">Forgot password?</Link> · <Link href="/register">Create account</Link></p></section></main>;
}
