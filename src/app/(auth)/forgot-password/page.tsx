import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";

export default function ForgotPasswordPage() {
  return <main className="shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><section className="glass card" style={{ width: "min(440px,100%)" }}><Logo /><h1>Reset your password</h1><p className="muted">Enter your account email. If it matches an account, we will send a secure reset link. Check Spam, Junk or Promotions if it is not in your Inbox.</p><AuthForm mode="reset" /></section></main>;
}
