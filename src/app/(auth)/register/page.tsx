import Link from "next/link";
import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";

export default function Register() { return <main className="shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "40px 0" }}><section className="glass card" style={{ width: "min(540px,100%)" }}><Logo /><span className="eyebrow" style={{ display: "block", marginTop: 32 }}>Create your workspace</span><h1 style={{ fontSize: 36, marginBottom: 8 }}>Create an account</h1><p className="muted">Enter your legal first and last name. We will send an email activation link before your first sign-in.</p><AuthForm mode="register" /><p className="muted">Already registered? <Link href="/login">Sign in</Link></p></section></main>; }
