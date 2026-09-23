import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "./admin";

export const SESSION_COOKIE = "sb_session";

// React request memoization prevents a dashboard layout and its page from
// verifying the same Firebase session cookie twice during one render.
const verifyCurrentSession = cache(async (checkRevoked: boolean) => {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try { return await adminAuth().verifySessionCookie(value, checkRevoked); }
  catch { return null; }
});

export async function currentUser(checkRevoked = false) {
  return verifyCurrentSession(checkRevoked);
}

export async function requireUser() {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  if (user.admin !== true) redirect("/dashboard");
  return user;
}
