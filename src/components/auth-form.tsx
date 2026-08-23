"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, inMemoryPersistence, sendEmailVerification, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";
import { firebaseAuth } from "@/lib/firebase/client";
import { Toast, type ToastKind } from "./toast";

type Notice = { kind: ToastKind; title: string; message: string };
function messageFor(error: unknown, mode: "login" | "register" | "reset"): Notice {
  const code = error instanceof FirebaseError ? error.code : "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"].includes(code)) return { kind: "error", title: "Sign-in unsuccessful", message: "Incorrect email or password. Check both entries and try again." };
  if (code === "auth/email-already-in-use") return { kind: "error", title: "Account already exists", message: "Sign in with this email or use the password-reset option." };
  if (code === "auth/weak-password") return { kind: "error", title: "Choose a stronger password", message: "Use at least 10 characters with a mix of letters, numbers and symbols." };
  if (code === "auth/invalid-email") return { kind: "error", title: "Check your email", message: "Enter a valid email address and try again." };
  if (code === "auth/too-many-requests") return { kind: "error", title: "Please wait before retrying", message: "Too many attempts were made. Wait a few minutes or reset your password." };
  if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") return { kind: "info", title: "Verify your email first", message: "Open the activation email and click the verification link. If it is not in your Inbox, check Spam, Junk or Promotions and mark it as Not spam." };
  return { kind: "error", title: mode === "login" ? "Sign-in unsuccessful" : mode === "register" ? "Registration unsuccessful" : "Request unsuccessful", message: "We could not complete that request. Check your connection and try again." };
}

export function AuthForm({ mode, initialNotice }: { mode: "login" | "register" | "reset"; initialNotice?: Notice }) {
  const router = useRouter(), [notice, setNotice] = useState<Notice | undefined>(initialNotice), [busy, setBusy] = useState(false), [showPassword, setShowPassword] = useState(false), [capsLock, setCapsLock] = useState(false);
  function checkCaps(event: KeyboardEvent<HTMLInputElement>) { setCapsLock(event.getModifierState("CapsLock")); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(undefined);
    const data = new FormData(event.currentTarget), email = String(data.get("email") || "").trim(), password = String(data.get("password") || ""), firstName = String(data.get("firstName") || "").trim(), lastName = String(data.get("lastName") || "").trim();
    try {
      const auth = firebaseAuth();
      const actionSettings = { url: `${window.location.origin}/login`, handleCodeInApp: false };
      if (mode === "reset") { const response = await fetch("/api/auth/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "reset", email }) }); if (!response.ok) await sendPasswordResetEmail(auth, email, actionSettings); router.push("/login?notice=reset-sent"); return; }
      await setPersistence(auth, inMemoryPersistence);
      if (mode === "register") {
        if (!firstName || !lastName) throw new Error("FULL_NAME_REQUIRED");
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: `${firstName} ${lastName}` });
        const branded = await fetch("/api/auth/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "verification", email, idToken: await credential.user.getIdToken(true) }) }); if (!branded.ok) await sendEmailVerification(credential.user, actionSettings); await auth.signOut(); router.push("/login?notice=verify-email"); return;
      }
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if (!credential.user.emailVerified) { await auth.signOut(); throw new Error("EMAIL_NOT_VERIFIED"); }
      const response = await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: await credential.user.getIdToken(true) }) });
      if (!response.ok) throw new Error("SESSION_FAILED");
      const session = await response.json() as { admin?: boolean }; await auth.signOut(); router.push(session.admin ? "/admin?notice=welcome" : "/dashboard?notice=welcome"); router.refresh();
    } catch (error) { setNotice(error instanceof Error && error.message === "FULL_NAME_REQUIRED" ? { kind: "error", title: "Full name required", message: "Enter both your first name and last name." } : messageFor(error, mode)); setBusy(false); }
  }
  return <>{notice ? <Toast {...notice} onClose={() => setNotice(undefined)} /> : null}<form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 28 }}>
    {mode === "register" ? <div className="form-grid"><label>First name<input className="field" name="firstName" autoComplete="given-name" minLength={2} maxLength={40} pattern=".*\S.*" required /></label><label>Last name<input className="field" name="lastName" autoComplete="family-name" minLength={2} maxLength={40} pattern=".*\S.*" required /></label></div> : null}
    <label>Email address<input className="field" name="email" type="email" autoComplete="email" required /></label>
    {mode !== "reset" ? <label>Password<div className="password-field"><input className="field" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} maxLength={128} onKeyUp={checkCaps} onKeyDown={checkCaps} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>{capsLock ? <small className="form-hint warning">Caps Lock is on.</small> : <small className="form-hint">{mode === "register" ? "Use at least 10 characters." : "Use the eye icon to check what you entered."}</small>}</label> : null}
    {mode === "register" ? <label className="check-label"><input type="checkbox" required /> <span>I agree to the <Link href="/terms">Terms of Service</Link>, <Link href="/privacy">Privacy Policy</Link> and <Link href="/acceptable-use">Acceptable Use Policy</Link>.</span></label> : null}
    <button className="btn primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in securely" : mode === "register" ? "Create account" : "Send reset link"}</button>
  </form></>;
}
