# Firestore Network Egress Audit

Audit date: 19 October 2026  
Production project: `socialbooster-cbcc6`  
Code baseline: `9c986d376c930b3e1fedf262e3448cffcdf5703c`

This audit used bounded, read-only Firestore REST requests against the three active provider manifests, their active public-catalogue and fingerprint chunks, the compact global catalogue manifest, and support-attachment size metadata. It did not run a provider sync, read attachment contents, create an order, process a payment, alter a wallet, or write production data. The sizes below are conservative application-level estimates; Google Cloud billing can differ because document names, protobuf framing, and transport compression are not reproduced here.

## Result

The optimized design is safe for the Spark strategy at current low traffic. Its steady-state unchanged catalogue job is about 10 KB/day, catalogue browsing is zero-read after Vercel cache warmup, and a full compact catalogue reconstruction is about 2.34 MB. A planning envelope of 15–100 MB/month leaves substantial headroom below the preferred 1 GiB/month target and the required 10 GiB/month ceiling. Actual usage must still be compared after release with the Google Cloud Billing SKU **Cloud Firestore Internet Data Transfer Out**.

This finding is for the validated release candidate. Production remains on the previous snapshot format until this candidate is deliberately released and the next guarded provider synchronization migrates each snapshot.

## Public catalogue payload

| Provider | Public rows | Chunks | Current total | Current average | Current largest | Compact total | Compact average | Compact largest |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Followpanel | 616 | 4 | 309,877 B | 77,469 B | 100,853 B | 191,292 B | 47,823 B | 62,144 B |
| Nitro | 7,252 | 37 | 3,351,548 B | 90,582 B | 95,172 B | 1,961,154 B | 53,004 B | 55,553 B |
| SMM World | 680 | 4 | 318,493 B | 79,623 B | 95,079 B | 187,306 B | 46,827 B | 55,726 B |
| **Total** | **8,548** | **45** | **3,979,918 B** | **88,443 B** | **100,853 B** | **2,339,752 B** | **51,994 B** | **62,144 B** |

The three provider manifests add 1,394 bytes, so the full current public snapshot is approximately **3,981,312 bytes (3.80 MiB)**. The compact v3 snapshot is projected at **2,341,146 bytes (2.23 MiB)**. Deriving the repeated generic description at render time saves approximately **1,640,166 bytes (1.56 MiB), or 41%** per complete reconstruction.

The production compact global manifest was 456 bytes and reported 2,407 exact public services after quality filtering and deterministic cross-provider de-duplication. Provider row totals above are pre-de-duplication snapshot rows.

## Provider fingerprint payload

| Provider | Chunks | Total | Average | Largest | Sync-state document |
| --- | ---: | ---: | ---: | ---: | ---: |
| Followpanel | 2 | 96,177 B | 48,089 B | 67,644 B | 1,853 B |
| Nitro | 18 | 863,463 B | 47,970 B | 48,256 B | 1,590 B |
| SMM World | 5 | 228,791 B | 45,758 B | 50,175 B | 1,577 B |
| **Total** | **25** | **1,188,431 B** | **47,537 B** | **67,644 B** | **5,020 B** |

No per-chunk telemetry documents are written. The repository includes a guarded aggregate-only audit script for a future authorized read-only measurement.

## Cache and synchronization changes

- Synchronization now returns `publicCatalogueChanged` explicitly.
- The daily cron invalidates `active-service-catalog` only when a public snapshot actually changed.
- An all-unchanged provider run retains the exact global counts and hashes instead of rereading all 45 public chunks.
- The compact global manifest contains `publicEligibleCount`, `providerCounts`, `providerSnapshotHashes`, `combinedPublicHash`, and `updatedAt`, and is rewritten only after a public change.
- Public snapshot v3 omits the formulaic description. The same safe instructions are derived by `publicServiceDescription` when cached public data is rendered.
- Chunk cache keys include provider, snapshot version/slot, immutable snapshot hash, and chunk index. Immutable chunks have neither a broad cache tag nor a 24-hour expiry.
- Only the small descriptor and result-page cache layers retain the catalogue tag. Their obsolete 24-hour refresh was removed.
- Service detail resolution still uses cached public catalogue data and never introduces a direct `services` Firestore read.
- Admin visibility, merchandising, SEO, advertising, and standard-margin price actions only refresh public caches when the published snapshot hash changes.

## Reads and estimated returned bytes

| Path | Reads | Estimated bytes |
| --- | ---: | ---: |
| Cold public catalogue, current v2 | 48 | 3,981,312 B |
| Cold public catalogue, compact v3 | 48 | 2,341,146 B |
| Warm catalogue or service detail | 0 | 0 B until the hash changes or the platform evicts the cache |
| Unchanged daily provider sync, before | 102 | 7,972,664 B |
| Unchanged daily provider sync, after | 6 | 10,040 B |
| Changed sync, compact baseline | 73 plus two documents per changed service | about 3,539,617 B plus changed service documents |
| Admin provider page | up to 79 bounded Firestore documents | planning estimate 0.08–0.40 MB, dependent on order text |
| Finance page | below 50 bounded Firestore documents | planning estimate 0.05–0.25 MB |
| Support attachment download | one support message plus one attachment document | attachment bytes plus a small authorization read |

The first post-release v2-to-v3 migration is expected to read about 5.18 MB before changed-service document reads because it must safely consume the existing snapshot once. That is a bounded one-time conversion, not a daily steady-state cost.

## Ranked large-payload review

1. **`supportAttachments`** — raw bytes allow one document up to 700 KiB. This is the only deliberately large single-document payload and can exceed 100 KB.
2. **`publicCatalogChunks`** — the measured largest active v2 document is about 100,853 bytes. Compact v3 projects the largest at about 62,144 bytes.
3. **`services` and `providerServices`** — provider-supplied descriptive text is duplicated in these internal service documents and the standard-panel description schema has no explicit length bound. A malicious or broken upstream description is therefore capable of producing a document above 100 KB. Public browsing no longer transfers this field. Add an upstream-text bound in a separate provider-contract change after fixture review.
4. **`providerFingerprintChunks`** — measured largest is 67,644 bytes. The fixed 500-record chunking bounds reads, but this remains the fourth-largest repeated payload.
5. **Support messages, marketing drafts, webhook records, audit logs, and order records** — repository input limits keep normal individual documents well below 100 KB (support/marketing text is bounded and inbound attachment metadata is capped). No raw provider API response or catalogue JSON payload is stored as a single Firestore document.

## Support attachments

Production contains **1 attachment document** with **147,765 stored bytes** according to metadata. A download transfers approximately 147,765 bytes plus one small support-message authorization read. The release does not read, migrate, overwrite, or delete the attachment.

If attachment volume becomes material, move new binaries to private object storage and keep only the object key, size, media type, ownership, and message relationship in Firestore. Serve downloads through an authenticated, short-lived URL or server authorization layer. Evaluate the chosen object store's then-current free allowance and egress pricing before migration, and keep the existing Firestore records readable until a separately tested migration is complete.

## Monthly planning envelope

- Unchanged scheduled synchronization: about 0.01 MB/day, or 0.30 MB/month.
- One changed sync in a month: about 3.54 MB plus the changed service documents.
- Four compact cold-cache reconstructions: about 9.36 MB.
- Suggested low-traffic engineering envelope, including bounded admin traffic and cache eviction: **15–100 MB/month (0.015–0.10 GB/month)**.
- Preferred target: **below 1 GiB/month**.
- Required ceiling for the Spark strategy: **below 10 GiB/month**.

The estimate intentionally does not claim to be Cloud Billing telemetry. After release, compare at least seven normal days with **Cloud Firestore Internet Data Transfer Out**, while separating deployment/migration days and intentional attachment downloads.

## Validation

| Gate | Result |
| --- | --- |
| TypeScript | Passed |
| ESLint | Passed with zero warnings |
| Full regression suite | Passed: 34 files / 171 tests |
| Firebase Rules regression | Passed inside the suite: 3 tests |
| Production build | Passed: all 88 generated pages; protected/admin routes compiled |
| Production dependency audit | Passed: zero vulnerabilities |
| Tracked-file secret scan | Passed: no private-key or common live-token pattern found |
| Live financial/provider operations | Not performed by design |

Finance reconciliation, 40% gross-margin tests, provider confirmation recovery, Growth Enablement, referrals, GA4 architecture, lifecycle segmentation, provider hash short-circuiting, and active-service safeguards all remain covered by the passing regression suite.

## Decision

**SAFE FOR SPARK NEXT MONTH**, subject to releasing the validated candidate and confirming the real post-release billing line. Do not downgrade or change the Firebase plan automatically.
