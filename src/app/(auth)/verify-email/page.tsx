import { Logo } from "@/components/logo";
import { VerifyEmailClient } from "@/components/verify-email-client";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ oobCode?: string }> }) {
  const { oobCode } = await searchParams;
  return <main className="shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "40px 0" }}><section className="glass card" style={{ width: "min(480px,100%)" }}><Logo /><VerifyEmailClient code={oobCode} /></section></main>;
}
