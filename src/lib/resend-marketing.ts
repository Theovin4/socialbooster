import { marketingSegments, marketingTopics, normalizeEmail, type MarketingSegmentId, type MarketingTopicId } from "./marketing";

type ResendResult = { id?: string; object?: string; message?: string; error?: { message?: string } };

class ResendMarketingError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function configuration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = (process.env.EMAIL_MARKETING_FROM || process.env.EMAIL_FROM)?.trim();
  const segmentIds = parseIdMap<MarketingSegmentId>(process.env.RESEND_MARKETING_SEGMENTS);
  const legacyEligibleSegment = process.env.RESEND_MARKETING_AUDIENCE_ID?.trim();
  if (!segmentIds.eligible && legacyEligibleSegment) segmentIds.eligible = legacyEligibleSegment;
  const topicIds = parseIdMap<MarketingTopicId>(process.env.RESEND_MARKETING_TOPICS);
  return { apiKey, segmentIds, topicIds, from, configured: Boolean(apiKey && segmentIds.eligible && from) };
}

function parseIdMap<T extends string>(value: string | undefined) {
  if (!value?.trim()) return {} as Partial<Record<T, string>>;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, id]) => typeof id === "string" && /^[0-9a-f-]{20,}$/i.test(id))) as Partial<Record<T, string>>;
  } catch {
    return {} as Partial<Record<T, string>>;
  }
}

async function request(path: string, init: RequestInit, idempotencyKey?: string) {
  const { apiKey } = configuration();
  if (!apiKey) throw new Error("Resend marketing is not configured");
  const response = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}), ...(init.headers || {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => ({})) as ResendResult;
  if (!response.ok) throw new ResendMarketingError(result.message || result.error?.message || `Resend request failed (${response.status})`, response.status);
  return result;
}

export function resendMarketingConfiguration() {
  const value = configuration();
  return {
    configured: value.configured,
    senderConfigured: Boolean(value.from),
    configuredSegments: marketingSegments.filter((segment) => Boolean(value.segmentIds[segment.id])).map((segment) => segment.id),
    configuredTopics: marketingTopics.filter((topic) => Boolean(value.topicIds[topic.id])).map((topic) => topic.id),
  };
}

export async function synchronizeMarketingContact(input: { email: string; firstName?: string | null; subscribed: boolean }) {
  const email = normalizeEmail(input.email);
  try {
    return await request("/contacts", {
      method: "POST",
      body: JSON.stringify({ email, first_name: input.firstName || undefined, unsubscribed: !input.subscribed }),
    }, `marketing-contact-create-${email}`);
  } catch (error) {
    if (!(error instanceof ResendMarketingError) || error.status !== 409) throw error;
    return request(`/contacts/${encodeURIComponent(email)}`, {
      method: "PATCH",
      body: JSON.stringify({ first_name: input.firstName || undefined, unsubscribed: !input.subscribed }),
    }, `marketing-contact-update-${email}-${input.subscribed ? "on" : "off"}`);
  }
}

export async function synchronizeMarketingSegments(emailInput: string, memberships: MarketingSegmentId[]) {
  const { segmentIds } = configuration();
  const email = normalizeEmail(emailInput);
  const selected = new Set(memberships);
  await Promise.all(Object.entries(segmentIds).map(([segment, segmentId]) => {
    if (!segmentId) return Promise.resolve(null);
    return request(`/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(segmentId)}`, {
      method: selected.has(segment as MarketingSegmentId) ? "POST" : "DELETE",
    }).catch((error) => {
      // Removing a contact that is already absent is an idempotent success.
      if (!selected.has(segment as MarketingSegmentId) && error instanceof ResendMarketingError && error.status === 404) return null;
      throw error;
    });
  }));
}

export async function synchronizeMarketingTopics(emailInput: string, preferences: Partial<Record<MarketingTopicId, boolean>>) {
  const { topicIds } = configuration();
  const topics = Object.entries(topicIds).flatMap(([topic, id]) => id ? [{ id, subscription: preferences[topic as MarketingTopicId] === true ? "opt_in" : "opt_out" }] : []);
  if (!topics.length) return null;
  return request(`/contacts/${encodeURIComponent(normalizeEmail(emailInput))}/topics`, { method: "PATCH", body: JSON.stringify({ topics }) });
}

export function resendSegmentId(segment: MarketingSegmentId) {
  return configuration().segmentIds[segment] || null;
}

export async function createResendBroadcastDraft(input: { name: string; subject: string; preheader?: string; html: string; segment: MarketingSegmentId; topic?: MarketingTopicId; idempotencyKey: string }) {
  const { segmentIds, topicIds, from } = configuration();
  const segmentId = segmentIds[input.segment];
  if (!segmentId || !from) throw new Error(`Resend segment is not configured for ${input.segment}`);
  return request("/broadcasts", { method: "POST", body: JSON.stringify({ segment_id: segmentId, topic_id: input.topic ? topicIds[input.topic] : undefined, from, name: input.name, subject: input.subject, preview_text: input.preheader || undefined, html: input.html }) }, input.idempotencyKey);
}

export async function cancelResendBroadcast(id: string) {
  return request(`/broadcasts/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

export async function scheduleResendBroadcast(id: string, scheduledAt: string) {
  return request(`/broadcasts/${encodeURIComponent(id)}/send`, { method: "POST", body: JSON.stringify({ scheduled_at: scheduledAt }) }, `marketing-broadcast-schedule-${id}-${scheduledAt}`);
}
