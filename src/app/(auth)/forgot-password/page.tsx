import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";

export default function ForgotPasswordPage() {
  return <main className="shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><section className="glass card" style={{ width: "min(440px,100%)" }}><Logo /><h1>Reset password</h1><p className="muted">Enter your account email. Check Spam or Promotions if the message does not arrive.</p><AuthForm mode="reset" /></section></main>;
}
