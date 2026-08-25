import { adminAuth } from "./firebase/admin";

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
export function brandedEmail(input: { title: string; preview: string; message: string; buttonLabel?: string; buttonUrl?: string }) {
  const app = process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng";
  const button = input.buttonLabel && input.buttonUrl ? `<p style="margin:28px 0"><a href="${escapeHtml(input.buttonUrl)}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#2179ee;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(input.buttonLabel)}</a></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#07101f;font-family:Arial,sans-serif;color:#eef4ff"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preview)}</div><div style="padding:32px 14px"><div style="max-width:600px;margin:auto;background:#0d1930;border:1px solid #24344f;border-radius:18px;overflow:hidden"><div style="padding:26px 32px;border-bottom:1px solid #24344f"><img src="${app}/icon-192.png" width="42" height="42" alt="Social Booster" style="vertical-align:middle;margin-right:12px"><strong style="font-size:20px">SOCIAL <span style="color:#55d9ff">BOOSTER</span></strong></div><div style="padding:34px 32px"><h1 style="margin:0 0 16px;font-size:28px;line-height:1.25">${escapeHtml(input.title)}</h1><p style="margin:0;color:#b7c4d9;font-size:16px;line-height:1.7">${escapeHtml(input.message)}</p>${button}<p style="margin:30px 0 0;color:#7f90aa;font-size:13px;line-height:1.6">For your security, Social Booster will never ask for your password, card PIN, CVV or OTP.</p></div></div></div></body></html>`;
}

export async function sendBrandedEmail(input: { to: string; subject: string; html: string }) {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("Branded email is not configured");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [input.to], reply_to: "support@socialbooster.net.ng", subject: input.subject, html: input.html }) });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status})`);
}

export async function sendUserEmail(userId: string, input: { subject: string; title: string; message: string; buttonLabel?: string; buttonUrl?: string }) {
  const user = await adminAuth().getUser(userId);
  if (!user.email) return;
  await sendBrandedEmail({ to: user.email, subject: input.subject, html: brandedEmail({ title: input.title, preview: input.subject, message: input.message, buttonLabel: input.buttonLabel, buttonUrl: input.buttonUrl }) });
}
