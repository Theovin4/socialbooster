import nextEnv from "@next/env";
import { createRequire } from "node:module";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import { approximateFirestoreValueBytes, summarizePayloadBytes } from "../src/lib/firestore-egress.ts";

if (!process.argv.includes("--approved-production-read-only")) {
  throw new Error("Pass --approved-production-read-only to confirm this bounded audit may read production Firestore.");
}

nextEnv.loadEnvConfig(process.cwd());
const projectId = process.env.FIREBASE_PROJECT_ID || "socialbooster-cbcc6";
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (projectId !== "socialbooster-cbcc6") throw new Error(`Unexpected Firebase project: ${projectId}`);

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
      // Try the next supported credential source without logging token details.
    }
  }
  return null;
}

async function accessToken() {
  if (clientEmail && privateKey) {
    return new GoogleAuth({ credentials: { client_email: clientEmail, private_key: privateKey }, scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getAccessToken();
  }
  const cliToken = await firebaseCliAccessToken();
  if (cliToken) return cliToken;
  return new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getAccessToken();
}

const token = await accessToken();
if (!token) throw new Error("No Google access token is available for the bounded read-only audit.");
const firestoreRoot = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;

function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("bytesValue" in value) return Buffer.from(value.bytesValue, "base64");
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  if ("referenceValue" in value) return value.referenceValue;
  return null;
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}

function snapshot(document, fallbackId = "") {
  const data = document ? decodeFields(document.fields) : undefined;
  const id = document?.name?.split("/").at(-1) || fallbackId;
  return { id, exists: Boolean(document), data: () => data, get: (field) => data?.[field] };
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore REST audit request failed (${response.status}).`);
  return response.json();
}

function documentUrl(collection, id) {
  return `${firestoreRoot}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
}

const db = {
  collection(collection) {
    return {
      doc(id) { return { get: async () => snapshot(await request(documentUrl(collection, id)), id) }; },
      select(...fields) {
        return { get: async () => {
          const rows = await request(`${firestoreRoot}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: { select: { fields: fields.map((fieldPath) => ({ fieldPath })) }, from: [{ collectionId: collection }] } }) });
          const docs = (rows || []).flatMap((row) => row.document ? [snapshot(row.document)] : []);
          return { docs, size: docs.length };
        } };
      },
    };
  },
  getAll(...refs) { return Promise.all(refs.map((ref) => ref.get())); },
};
const providers = ["followspanel", "nitro", "smmworld"];

const platformCodes = { "apple music": "am", audiomack: "au", instagram: "ig", tiktok: "tt", facebook: "fb", youtube: "yt", telegram: "tg", "x (twitter)": "x", spotify: "sp", soundcloud: "sc", threads: "th", whatsapp: "wa", linkedin: "li", discord: "dc", twitch: "tw", snapchat: "sn", pinterest: "pi", reddit: "rd", music: "mu" };
const kindCodes = { subscribers: "sb", members: "m", followers: "f", views: "v", likes: "l", comments: "c", shares: "sh", reactions: "r", plays: "p", streams: "st", engagement: "e", saves: "sv" };
function projectedSemantics(item) {
  const name = String(item.name || ""), [categoryPlatform = "Social Media", categoryKind = "Service"] = String(item.category || "").split(" · ");
  const platformName = Object.keys(platformCodes).find((value) => name.toLowerCase().includes(value)) || categoryPlatform.toLowerCase();
  const kindName = Object.keys(kindCodes).find((value) => categoryKind.toLowerCase().includes(value)) || categoryKind.toLowerCase();
  const s = { p: platformCodes[platformName] || platformName.slice(0, 4), k: kindCodes[kindName] || kindName.slice(0, 3) };
  const variants = [[/\bpositive\b/i, "p"], [/\bnegative\b/i, "n"], [/\bmixed\b/i, "x"], [/\bfemale\b/i, "f"], [/\bmale\b/i, "m"]];
  const targets = [[/\blive[\s-]*stream\b/i, "ls"], [/\bshorts?\b/i, "sh"], [/\bstor(?:y|ies)\b/i, "st"], [/\breels?\b/i, "r"], [/\bposts?\b/i, "p"], [/\bchannels?\b/i, "c"], [/\bgroups?\b/i, "g"], [/\bpages?\b/i, "pg"], [/\bprofiles?\b/i, "pr"], [/\bvideos?\b/i, "v"], [/\btracks?\b/i, "t"], [/\bplaylists?\b/i, "pl"]];
  const variant = variants.find(([pattern]) => pattern.test(name)); if (variant) s.v = variant[1];
  const target = targets.find(([pattern]) => pattern.test(name)); if (target) s.t = target[1];
  const future = name.match(/\b(\d{1,3})\s+posts?\b/i); if (future) s.n = Number(future[1]);
  const emojis = name.match(/\p{Extended_Pictographic}\uFE0F?/gu); if (emojis?.length) s.e = [...new Set(emojis)].join(" ");
  return s;
}

function documentValue(snapshot) {
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

async function loadDocuments(collection, ids) {
  if (!ids.length) return [];
  const snapshots = await db.getAll(...ids.map((id) => db.collection(collection).doc(id)));
  return snapshots.filter((snapshot) => snapshot.exists).map(documentValue);
}

const [manifests, syncStates, globalManifest, supportMetadata] = await Promise.all([
  db.getAll(...providers.map((provider) => db.collection("publicCatalogManifests").doc(provider))),
  db.getAll(...providers.map((provider) => db.collection("providerSyncState").doc(provider))),
  db.collection("publicCatalogStats").doc("current").get(),
  db.collection("supportAttachments").select("size").get(),
]);

const publicByProvider = {};
const fingerprintByProvider = {};
for (let index = 0; index < providers.length; index += 1) {
  const provider = providers[index];
  const manifest = manifests[index];
  const version = Number(manifest.get("version") || 0);
  const activeSlot = manifest.get("activeSlot") === "b" ? "b" : "a";
  const slots = manifest.get("slots") || {};
  const chunkCount = version === 1 ? Number(manifest.get("chunkCount") || 0) : Number(slots[activeSlot]?.chunkCount || manifest.get("chunkCount") || 0);
  const publicIds = Array.from({ length: chunkCount }, (_, chunkIndex) => version === 1
    ? `${provider}_${String(chunkIndex).padStart(4, "0")}`
    : `${provider}_${activeSlot}_${String(chunkIndex).padStart(4, "0")}`);
  const publicDocuments = await loadDocuments("publicCatalogChunks", publicIds);
  const compactPublicDocuments = publicDocuments.map((document) => ({
    ...document,
    items: Array.isArray(document.items) ? document.items.map((item) => {
      const compact = { ...item };
      delete compact.description;
      return compact;
    }) : document.items,
  }));
  const semanticPublicDocuments = compactPublicDocuments.map((document) => ({
    ...document, version: 4,
    items: Array.isArray(document.items) ? document.items.map((item) => ({ ...item, s: item.s || projectedSemantics(item) })) : document.items,
  }));
  publicByProvider[provider] = {
    version,
    serviceCount: Number(manifest.get("serviceCount") || slots[activeSlot]?.serviceCount || 0),
    manifestBytes: approximateFirestoreValueBytes(documentValue(manifest)),
    chunks: summarizePayloadBytes(publicDocuments),
    compactChunks: summarizePayloadBytes(compactPublicDocuments),
    semanticV4Chunks: summarizePayloadBytes(semanticPublicDocuments),
  };

  const state = syncStates[index];
  const fingerprintSlot = state.get("activeFingerprintSlot") === "b" ? "b" : "a";
  const fingerprintSlots = state.get("fingerprintSlots") || {};
  const fingerprintChunkCount = Number(fingerprintSlots[fingerprintSlot]?.chunkCount || state.get("fingerprintChunkCount") || 0);
  const fingerprintIds = Array.from({ length: fingerprintChunkCount }, (_, chunkIndex) => `${provider}_${fingerprintSlot}_${String(chunkIndex).padStart(4, "0")}`);
  fingerprintByProvider[provider] = {
    stateBytes: approximateFirestoreValueBytes(documentValue(state)),
    chunks: summarizePayloadBytes(await loadDocuments("providerFingerprintChunks", fingerprintIds)),
  };
}

const publicManifestBytes = Object.values(publicByProvider).reduce((sum, item) => sum + item.manifestBytes, 0);
const publicChunkBytes = Object.values(publicByProvider).reduce((sum, item) => sum + item.chunks.totalBytes, 0);
const compactPublicChunkBytes = Object.values(publicByProvider).reduce((sum, item) => sum + item.compactChunks.totalBytes, 0);
const semanticV4ChunkBytes = Object.values(publicByProvider).reduce((sum, item) => sum + item.semanticV4Chunks.totalBytes, 0);
const stateBytes = Object.values(fingerprintByProvider).reduce((sum, item) => sum + item.stateBytes, 0);
const fingerprintBytes = Object.values(fingerprintByProvider).reduce((sum, item) => sum + item.chunks.totalBytes, 0);
const supportStoredBytes = supportMetadata.docs.reduce((sum, snapshot) => sum + Math.max(0, Number(snapshot.get("size") || 0)), 0);
const publicSnapshotReadBytes = publicManifestBytes + publicChunkBytes;

const report = {
  projectId,
  measuredAt: new Date().toISOString(),
  publicCatalog: {
    currentServices: Number(globalManifest.get("publicEligibleCount") || 0),
    globalManifestBytes: approximateFirestoreValueBytes(documentValue(globalManifest)),
    totalSnapshotBytes: publicSnapshotReadBytes,
    projectedCompactSnapshotBytes: publicManifestBytes + compactPublicChunkBytes,
    projectedDescriptionSavingsBytes: publicChunkBytes - compactPublicChunkBytes,
    projectedSemanticV4SnapshotBytes: publicManifestBytes + semanticV4ChunkBytes,
    projectedSemanticV4DifferenceBytes: semanticV4ChunkBytes - publicChunkBytes,
    providers: publicByProvider,
  },
  providerFingerprints: {
    totalSnapshotBytes: fingerprintBytes,
    providers: fingerprintByProvider,
  },
  unchangedDailySync: {
    before: {
      reads: providers.length * 2 + Object.values(publicByProvider).reduce((sum, item) => sum + item.chunks.documentCount + 1, 0) * 2,
      estimatedBytes: stateBytes * 2 + publicSnapshotReadBytes * 2,
      note: "Includes the old all-provider snapshot reload and one post-invalidation catalogue reconstruction.",
    },
    after: {
      reads: providers.length * 2,
      estimatedBytes: stateBytes * 2,
      note: "Provider sync-state lock/finalization reads only; provider API traffic is not Firestore egress.",
    },
  },
  changedSyncBaseline: {
    estimatedBytesBeforeChangedServiceDocuments: stateBytes * 2 + fingerprintBytes + publicSnapshotReadBytes,
    note: "A changed sync additionally reads two service documents per changed provider service. The final exact amount depends on the changed rows.",
  },
  supportAttachments: {
    documentCount: supportMetadata.size,
    storedBytesFromMetadata: supportStoredBytes,
    downloadEgress: "One authenticated download transfers approximately the attachment size plus a small support-message authorization read.",
  },
  caveat: "Application-level estimates, not Google Cloud billed-byte measurements. Compare with Cloud Firestore Internet Data Transfer Out.",
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
