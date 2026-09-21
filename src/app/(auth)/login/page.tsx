import Link from "next/link";
import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";

export default async function Login({ searchParams }: { searchParams: Promise<{ notice?: string; next?: string }> }) {
  const { notice, next } = await searchParams;
  const initialNotice = notice === "email-verified" ? { kind: "success" as const, title: "Email verified", message: "Your email is confirmed. Sign in to continue to your account." } : notice === "verify-email" ? { kind: "success" as const, title: "Email verification sent", message: "Your account is active. Sign in now, and verify your email from the reminder in your dashboard." } : notice === "reset-sent" ? { kind: "success" as const, title: "Check your email", message: "If the address matches an account, a reset link was sent. Check Spam, Junk or Promotions if it is not in your Inbox." } : notice === "signed-out" ? { kind: "success" as const, title: "Signed out", message: "You have been signed out securely." } : undefined;
  return <main className="shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "40px 0" }}><section className="glass card" style={{ width: "min(440px,100%)" }}><Logo /><h1 style={{ fontSize: 36, margin: "32px 0 8px" }}>Welcome back</h1><p className="muted">Sign in to continue.</p><AuthForm mode="login" initialNotice={initialNotice} returnTo={next} /><p className="muted"><Link href="/forgot-password">Forgot password?</Link> · <Link href="/register">Create account</Link></p></section></main>;
}
