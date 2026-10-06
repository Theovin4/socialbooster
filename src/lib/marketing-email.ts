import { marketingTemplates, type MarketingTemplateId } from "./marketing";

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);

export type MarketingEmailInput = {
  templateId: MarketingTemplateId;
  subject?: string;
  preheader?: string;
  heading?: string;
  body?: string;
  ctaText?: string;
  ctaUrl?: string;
  campaignId: string;
};

function safeUrl(value: string | undefined, campaignId: string) {
  const app = process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng";
  const url = new URL(value || "/dashboard", app);
  if (url.protocol !== "https:" || !["socialbooster.net.ng", "www.socialbooster.net.ng"].includes(url.hostname)) throw new Error("Campaign links must use the Social Booster domain");
  url.searchParams.set("utm_source", "resend");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", campaignId);
  return url.toString();
}

export function renderMarketingEmail(input: MarketingEmailInput) {
  const template = marketingTemplates.find((item) => item.id === input.templateId);
  if (!template) throw new Error("Unknown marketing template");
  const app = process.env.NEXT_PUBLIC_APP_URL || "https://www.socialbooster.net.ng";
  const subject = (input.subject || template.subject).trim().slice(0, 120);
  const preheader = (input.preheader || template.preheader).trim().slice(0, 180);
  const heading = (input.heading || template.heading).trim().slice(0, 120);
  const body = (input.body || template.body).trim().slice(0, 2_000);
  const ctaText = (input.ctaText || template.ctaText).trim().slice(0, 60);
  const ctaUrl = safeUrl(input.ctaUrl || template.ctaUrl, input.campaignId);
  const html = `<!doctype html><html><body style="margin:0;background:#07101f;font-family:Arial,sans-serif;color:#eef4ff"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div><div style="padding:32px 14px"><div style="max-width:600px;margin:auto;background:#0d1930;border:1px solid #24344f;border-radius:18px;overflow:hidden"><div style="padding:26px 32px;border-bottom:1px solid #24344f"><img src="${app}/icon-192.png" width="42" height="42" alt="Social Booster" style="vertical-align:middle;margin-right:12px"><strong style="font-size:20px">SOCIAL <span style="color:#55d9ff">BOOSTER</span></strong></div><div style="padding:34px 32px"><p style="margin:0 0 12px;color:#8bdfff;font-size:13px;font-weight:700">Hello {{{FIRST_NAME|there}}},</p><h1 style="margin:0 0 16px;font-size:28px;line-height:1.25">${escapeHtml(heading)}</h1><p style="margin:0;color:#b7c4d9;font-size:16px;line-height:1.7">${escapeHtml(body)}</p><p style="margin:28px 0"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#2179ee;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(ctaText)}</a></p><p style="margin:30px 0 0;color:#7f90aa;font-size:12px;line-height:1.6">You are receiving this because you opted in to Social Booster updates. <a style="color:#8bdfff" href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a> or <a style="color:#8bdfff" href="${app}/dashboard/preferences">manage preferences</a>.</p></div></div></div></body></html>`;
  return { subject, preheader, html, ctaUrl };
}
