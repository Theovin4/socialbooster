import Link from "next/link";
import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";

export default function Register() { return <main className="shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "40px 0" }}><section className="glass card" style={{ width: "min(540px,100%)" }}><Logo /><h1 style={{ fontSize: 36, margin: "32px 0 8px" }}>Create your account</h1><p className="muted">Use your full legal name. Email verification is required.</p><AuthForm mode="register" /><p className="muted">Already registered? <Link href="/login">Sign in</Link></p></section></main>; }
