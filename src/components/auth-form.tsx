"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, GoogleAuthProvider, inMemoryPersistence, sendEmailVerification, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, updateProfile, type User } from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";
import { firebaseAuth } from "@/lib/firebase/client";
import { Toast, type ToastKind } from "./toast";

type Notice = { kind: ToastKind; title: string; message: string };
function messageFor(error: unknown, mode: "login" | "register" | "reset"): Notice {
  const code = error instanceof FirebaseError ? error.code : "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"].includes(code)) return { kind: "error", title: "Unable to sign in", message: "Incorrect email or password." };
  if (code === "auth/email-already-in-use") return { kind: "error", title: "Account already exists", message: "Sign in with this email or use the password-reset option." };
  if (code === "auth/weak-password") return { kind: "error", title: "Choose a stronger password", message: "Use at least 10 characters with a mix of letters, numbers and symbols." };
  if (code === "auth/invalid-email") return { kind: "error", title: "Check your email", message: "Enter a valid email address and try again." };
  if (code === "auth/too-many-requests") return { kind: "error", title: "Please wait before retrying", message: "Too many attempts were made. Wait a few minutes or reset your password." };
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return { kind: "info", title: "Google sign-in cancelled", message: "No account changes were made. You can try again when ready." };
  if (code === "auth/popup-blocked") return { kind: "error", title: "Google window was blocked", message: "Allow pop-ups for Social Booster, then try again." };
  if (code === "auth/network-request-failed") return { kind: "error", title: "Connection interrupted", message: "We could not reach Google. Check your connection and try again." };
  if (code === "auth/unauthorized-domain") return { kind: "error", title: "Google sign-in is not available", message: "This website domain must be approved in Firebase Authentication before Google sign-in can continue." };
  if (code === "auth/operation-not-allowed") return { kind: "info", title: "Google sign-in is being prepared", message: "Please use email and password for now. Your account remains available." };
  if (code === "auth/account-exists-with-different-credential") return { kind: "info", title: "Use your existing sign-in method", message: "This email is already connected to another sign-in method. Sign in with your existing password first; your wallet and order history remain unchanged." };
  if (error instanceof Error && error.message === "SESSION_FAILED") return { kind: "info", title: "Sign-in needs another moment", message: "Your account is safe. Please try once more or use email and password." };
  return { kind: "error", title: mode === "login" ? "Unable to sign in" : mode === "register" ? "Unable to register" : "Unable to continue", message: "Please try again. If it continues, use your email and password." };
}

export function AuthForm({ mode, initialNotice, returnTo }: { mode: "login" | "register" | "reset"; initialNotice?: Notice; returnTo?: string }) {
  const router = useRouter(), [notice, setNotice] = useState<Notice | undefined>(initialNotice), [busy, setBusy] = useState(false), [showPassword, setShowPassword] = useState(false), [capsLock, setCapsLock] = useState(false);
  function checkCaps(event: KeyboardEvent<HTMLInputElement>) { setCapsLock(event.getModifierState("CapsLock")); }
  function destination(admin?: boolean) { if (returnTo?.startsWith("/") && !returnTo.startsWith("//") && (admin || !returnTo.startsWith("/admin"))) return returnTo; return admin ? "/admin?notice=welcome" : "/dashboard?notice=welcome"; }
  async function establishSession(user: User) {
    const response = await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: await user.getIdToken(true) }) });
    if (!response.ok) { console.error("[auth] session endpoint rejected sign-in", { status: response.status }); throw new Error("SESSION_FAILED"); }
    const session = await response.json() as { admin?: boolean };
    await firebaseAuth().signOut();
    router.push(destination(session.admin)); router.refresh();
  }
  async function googleSignIn() {
    setBusy(true); setNotice(undefined);
    try {
      const auth = firebaseAuth(); await setPersistence(auth, inMemoryPersistence);
      const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      await establishSession(credential.user);
    } catch (error) { setNotice(messageFor(error, mode)); setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(undefined);
    const data = new FormData(event.currentTarget), email = String(data.get("email") || "").trim().toLowerCase(), password = String(data.get("password") || ""), firstName = String(data.get("firstName") || "").trim(), lastName = String(data.get("lastName") || "").trim();
    try {
      const auth = firebaseAuth();
      const actionSettings = { url: `${window.location.origin}/login`, handleCodeInApp: false };
      if (mode === "reset") { const response = await fetch("/api/auth/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "reset", email }) }); if (!response.ok) await sendPasswordResetEmail(auth, email, actionSettings); router.push("/login?notice=reset-sent"); return; }
      await setPersistence(auth, inMemoryPersistence);
      if (mode === "register") {
        if (!firstName || !lastName) throw new Error("FULL_NAME_REQUIRED");
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: `${firstName} ${lastName}` });
        const idToken = await credential.user.getIdToken(true);
        try { const branded = await fetch("/api/auth/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "verification", email, idToken }) }); if (!branded.ok) await sendEmailVerification(credential.user, actionSettings); }
        catch { await sendEmailVerification(credential.user, actionSettings).catch(() => undefined); }
        const response = await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) });
        if (!response.ok) throw new Error("SESSION_FAILED");
        await auth.signOut(); router.push("/dashboard?notice=account-created"); router.refresh(); return;
      }
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if (!credential.user.emailVerified) {
        try { const branded = await fetch("/api/auth/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "verification", email, idToken: await credential.user.getIdToken(true) }) }); if (!branded.ok) await sendEmailVerification(credential.user, actionSettings); }
        catch { await sendEmailVerification(credential.user, actionSettings).catch(() => undefined); }
      }
      await establishSession(credential.user);
    } catch (error) { setNotice(error instanceof Error && error.message === "FULL_NAME_REQUIRED" ? { kind: "error", title: "Full name required", message: "Enter both your first name and last name." } : messageFor(error, mode)); setBusy(false); }
  }
  return <>{notice ? <Toast {...notice} onClose={() => setNotice(undefined)} /> : null}<form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 28 }}>
    {mode === "register" ? <div className="form-grid"><label>First name<input className="field" name="firstName" autoComplete="given-name" minLength={2} maxLength={40} pattern=".*\S.*" required /></label><label>Last name<input className="field" name="lastName" autoComplete="family-name" minLength={2} maxLength={40} pattern=".*\S.*" required /></label></div> : null}
    <label>Email address<input className="field" name="email" type="email" autoComplete="email" required /></label>
    {mode !== "reset" ? <label>Password<div className="password-field"><input className="field" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} maxLength={128} onKeyUp={checkCaps} onKeyDown={checkCaps} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>{capsLock ? <small className="form-hint warning">Caps Lock is on.</small> : <small className="form-hint">{mode === "register" ? "Use at least 10 characters." : "Use the eye icon to check what you entered."}</small>}</label> : null}
    {mode === "register" ? <label className="check-label"><input type="checkbox" required /> <span>I agree to the <Link href="/terms">Terms of Service</Link>, <Link href="/privacy">Privacy Policy</Link> and <Link href="/acceptable-use">Acceptable Use Policy</Link>.</span></label> : null}
    <button className="btn primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link"}</button>
    {mode !== "reset" ? <><div className="auth-divider"><span>or</span></div><button className="btn google-auth-button" type="button" onClick={googleSignIn} disabled={busy} aria-label="Continue with Google"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.35l-3.24-2.55c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.07 12c0-.67.12-1.32.32-1.93V7.45H3.05A10 10 0 0 0 2 12c0 1.61.38 3.14 1.05 4.55l3.34-2.62Z"/><path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.95 5.45l3.34 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>{busy ? "Connecting…" : "Continue with Google"}</button>{mode === "register" ? <small className="form-hint">By continuing with Google, you agree to the Terms, Privacy Policy and Acceptable Use Policy.</small> : null}</> : null}
  </form></>;
}
