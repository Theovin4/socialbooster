import nextEnv from "@next/env";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

if (!process.argv.includes("--approved-production-read-only")) {
  throw new Error("Pass --approved-production-read-only to confirm this bounded audit may read production Firestore.");
}

nextEnv.loadEnvConfig(process.cwd());
const firebaseRc = JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8"));
const projectId = process.env.FIREBASE_PROJECT_ID || firebaseRc.projects?.default;
if (projectId !== "socialbooster-cbcc6") throw new Error(`Unexpected Firebase project: ${projectId || "missing"}`);

async function firebaseCliAccessToken() {
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.FIREBASE_TOOLS_ROOT,
    process.env.APPDATA ? path.join(process.env.APPDATA, "npm", "node_modules", "firebase-tools") : null,
  ].filter(Boolean);
  for (const root of candidates) {
    try {
      const auth = require(path.join(root, "lib", "auth.js"));
      const account = auth.getGlobalDefaultAccount();
      if (!account?.tokens?.refresh_token) continue;
      const tokens = await auth.getAccessToken(account.tokens.refresh_token, ["https://www.googleapis.com/auth/cloud-platform"]);
      if (tokens?.access_token) return tokens.access_token;
    } catch {
      // Try the next supported credential source without exposing credentials.
    }
  }
  return null;
}

async function accessToken() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (clientEmail && privateKey) {
    return new GoogleAuth({ credentials: { client_email: clientEmail, private_key: privateKey }, scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getAccessToken();
  }
  return await firebaseCliAccessToken() || new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getAccessToken();
}

const token = await accessToken();
if (!token) throw new Error("No Google access token is available for the bounded read-only audit.");
const root = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

async function request(endpoint, body) {
  const response = await fetch(`${root}:${endpoint}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Firestore REST audit request failed (${response.status}).`);
  return response.json();
}

async function getDocument(collection, id, fields) {
  const mask = fields.map((field) => `mask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  const response = await fetch(`${root}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?${mask}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Firestore REST audit document read failed (${response.status}).`);
  return response.json();
}

function fieldFilter(fieldPath, op, value) {
  return { fieldFilter: { field: { fieldPath }, op, value: { stringValue: value } } };
}

async function count(where) {
  const rows = await request("runAggregationQuery", {
    structuredAggregationQuery: {
      aggregations: [{ alias: "total", count: {} }],
      structuredQuery: { from: [{ collectionId: "orders" }], ...(where ? { where } : {}) },
    },
  });
  return Number(rows?.[0]?.result?.aggregateFields?.total?.integerValue || 0);
}

function decode(value) {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  return null;
}

const statuses = ["completed", "partial", "pending", "processing", "in_progress", "provider_confirmation_required", "failed"];
const statusCounts = Object.fromEntries(await Promise.all(statuses.map(async (status) => [status, await count(fieldFilter("status", "EQUAL", status))])));
const refundReview = await count(fieldFilter("refundStatus", "EQUAL", "pending_confirmation"));
const financeDocument = await getDocument("analytics", "global", ["lastReconciliationStatus", "lastReconciledAt", "financeRollupVersion"]);
const recoveryRows = await request("runQuery", {
  structuredQuery: {
    select: { fields: ["providerLabel", "providerKey", "providerOrderId", "status", "providerStatus", "quantity", "startCount", "remains", "createdAt"].map((fieldPath) => ({ fieldPath })) },
    from: [{ collectionId: "orders" }],
    where: fieldFilter("status", "EQUAL", "provider_confirmation_required"),
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
    limit: 50,
  },
});
const unresolved = recoveryRows.flatMap((row) => row.document ? [{
  orderId: row.document.name.split("/").at(-1),
  provider: decode(row.document.fields?.providerLabel) || decode(row.document.fields?.providerKey) || "Unknown",
  providerOrderId: decode(row.document.fields?.providerOrderId) || "awaiting admin verification",
  socialBoosterStatus: decode(row.document.fields?.status) || "provider_confirmation_required",
  providerStatus: decode(row.document.fields?.providerStatus) || "awaiting admin verification",
  quantity: decode(row.document.fields?.quantity),
  startCount: decode(row.document.fields?.startCount),
  remains: decode(row.document.fields?.remains),
  expectedAction: "Administrator must verify and attach the matching Followpanel order ID",
}] : []);

process.stdout.write(`${JSON.stringify({
  projectId,
  measuredAt: new Date().toISOString(),
  counts: { ...statusCounts, refundReview },
  finance: {
    reconciliation: decode(financeDocument.fields?.lastReconciliationStatus),
    lastReconciledAt: decode(financeDocument.fields?.lastReconciledAt),
    rollupVersion: decode(financeDocument.fields?.financeRollupVersion),
  },
  unresolved,
}, null, 2)}\n`);
