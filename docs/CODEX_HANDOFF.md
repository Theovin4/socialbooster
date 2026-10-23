# Social Booster Codex handoff

## Emergency full service-description restoration (22 October 2026)

The customer-facing description regression was traced to the correct compact-catalogue optimization: `publicCatalogChunks` intentionally stopped carrying long provider text, but the service page and new-order form continued to use the generated semantic preview. The repair preserves that compact catalogue and adds an independent server-only `publicServiceDetails` document per internal service ID.

- Provider catalogue text is sanitized to readable customer text with a 5,000-character ceiling. Unsafe HTML, provider branding, URLs, contacts, wholesale data, API material and internal notes are removed while delivery, speed, refill, link, targeting, warnings and other product facts are retained.
- `shortDescription` remains the generated catalogue preview. `fullDescription` uses sanitized provider text whenever available, otherwise an explicitly labelled `generated_fallback`.
- `/services/[id]` loads and displays the full description. `/dashboard/new-order` fetches only the selected public service from `/api/public/services/[id]/details`, shows loading/failure states, and blocks submission until details are available.
- The details repository performs one Firestore document read on a cold per-service cache and zero repeated reads while warm. Long descriptions are not stored in or loaded with catalogue chunks.
- Normal provider synchronization compares description hashes, writes only missing/changed details, and invalidates only the affected service-detail cache tag. Description-only changes do not broadly invalidate the catalogue.
- The guarded admin maintenance endpoint accepts the exact `RESTORE_PUBLIC_SERVICE_DESCRIPTIONS` confirmation, supports a mandatory dry-run phase, calls provider `services()` only, reports writes/bytes/coverage/quality samples, and never calls provider order, balance, wallet, payment, refund or customer mutation paths.
- `/admin/service-descriptions` exposes separate protected dry-run and execute controls so the production repair can be performed through a server-verified administrator session and visibly reviewed between phases.
- Browser Firestore access to `publicServiceDetails` is explicitly denied; customer-safe details are returned only through the bounded public-ID endpoint.

Production repair evidence:

- Implementation commits `a82e620` and `4ef5d9d` were pushed to `main`. Existing Vercel project `socialbooster` deployed `4ef5d9df85aa7f91f5dda5a4500805d6b6653289` as `dpl_FTRHew61vZ38EywxcPRUpJwQyoJh`; it reached `READY` and serves the existing production aliases.
- The required production dry run found 8,490 internal detail documents for 2,999 deduplicated public/orderable services: 723 exposed provider descriptions, 2,276 explicit generated fallbacks, zero blanks and 100% coverage. The controlled plan was 8,303 creates, zero updates, 187 unchanged documents and 5,192,160 estimated description bytes.
- The explicitly confirmed description-only backfill completed with those exact counts. It called provider catalogue reads only. It did not submit a provider order or mutate a wallet, payment, refund, customer order or referral reward.
- A verification dry run returned zero creates, zero updates and 8,490 unchanged documents, proving that the repair completed and is idempotent.
- Provider detail-document coverage was Followpanel 576/576 (576 provider descriptions, zero fallbacks), Nitro 7,229/7,229 (783 provider descriptions, 6,446 fallbacks), and SMM World 685/685 (zero provider descriptions, 685 fallbacks). All three providers had zero blank descriptions.
- Live `/services/[id]` checks proved that provider descriptions and explicit fallbacks are visible, provider identity is hidden, and names retain reaction polarity, emoji and surface distinctions. Telegram positive, negative and emoji-specific services were verified. The current public inventory has no Telegram mixed-reaction service; the `telegram mixed reactions` and `telegram mix` searches did not expose one, so none was fabricated.
- Signed-in `/dashboard/new-order` checks selected both a provider-description service and a fallback service. Each loaded only its chosen description before submission; price, minimum, maximum, variant, target, link type, refill and cancellation remained visible. The Place Order button stayed disabled and no order data was entered.
- Ten live production samples were checked through the bounded customer-safe endpoint: `SB-BB20A8EFE34FF94F`, `SB-1DBEDCD7CF4F4506`, `SB-50C0C1AC28C3EBE8`, `SB-57561C4B2901C609`, `SB-94F6D8B55C8020F3`, `SB-2A826776CA7EA941`, `SB-1F63B5687973E807`, `SB-60688B01B354CEC7`, `SB-16C8AE37FC293710` and `SB-A6E6B00B8BDEA98B`. They cover Telegram, TikTok, Instagram, YouTube, Facebook and SoundCloud. Where an upstream provider supplies very terse text such as `pick. Refill within 30 days of completing.`, the sanitized provider text is faithfully preserved and the richer generated catalogue preview remains separately visible.
- The final local gate after the React-effect lint repair passed: 37 test files / 204 tests, isolated Firestore rules 3/3 within that suite, TypeScript, ESLint, production build with all 88 generated pages, production dependency audit with zero vulnerabilities, tracked-source secret scan, and `git diff --check`.
- Production Finance remained healthy with rollup version 2, historical backfill complete and stored reconciliation `MATCH` from the bounded release audit. No pricing or money file changed; the 40% gross-margin formula and regression suite remain intact.
- Detail payloads average approximately 612 bytes and peak at 1,084 bytes. Architecture remains one Firestore document read on the first uncached selected-service request and zero while its immutable cache is warm. Even a conservative 5,000 cold detail reads per day projects roughly 163 MB/month of raw detail payloads (comfortably below 1 GiB and the 10 GiB Spark ceiling); normal cached traffic should be materially lower.
- Vercel runtime-log inspection for the production deployment showed zero error, fatal or warning groups in the available 30-minute Hobby-plan window after live QA.

Remaining work is operational only: observe catalogue/description quality and Firestore billing, and correct provider-source text only through a separately reviewed content-quality rule. Do not re-run the production backfill unless a future dry run shows a hash change or missing document.

Snapshot date: 23 October 2026 (Africa/Lagos)

## Recovery and repository state

The interrupted work was recovered from the existing checkout. Nothing was rebuilt from scratch, reset, deleted, or overwritten.

| Item | Current state |
| --- | --- |
| Working checkout | `C:\Users\USER\Documents\Codex\2026-10-13\act-as-a-senior-software-engineer\work\socialbooster` |
| Repository | `https://github.com/Theovin4/socialbooster.git` |
| Branch / upstream | `main` / `origin/main` |
| Recovered baseline | `7c4e63a400142e0f2b39743b6323cc96e1eaf778` — `Document catalogue safety release` |
| Finance implementation commit | `b92b79d` — `Repair finance analytics and admin metrics` |
| Released handoff commit | `984df3b782228d5662ef7c569381cdfd1b659359` — `Document finance repair release gates` |
| Catalogue-cache completion commit | `73463b6591234ebb74808cec2d6bfedc9388737d` — `Initialize missing catalogue analytics cache` |
| Growth-pass baseline | `9026abfe466a6f3b4bd6450a99daebe2bfbf810c` — `Finalize finance repair handoff` |
| Growth enablement checkpoint | `674b585` — `Implement Social Booster growth enablement` |
| Provider recovery hardening | `5cdc74e` — `Harden provider confirmation recovery` |
| Legacy entity display fix | `f32d853` — `Normalize legacy service names in recovery views` |
| Firebase project | `socialbooster-cbcc6` |
| Production site | `https://www.socialbooster.net.ng` |
| Working tree | Combined Growth Enablement + Provider Confirmation Recovery released and production-smoke-tested; no payment, provider order, refund or reward was triggered during validation |

No real payment, order, refill, cancellation, provider submission, crypto approval, wallet mutation, customer-data mutation, or manual provider synchronization was used during this repair.

## Architecture

### Application and hosting

- Next.js 16 App Router, React 19, TypeScript and Node.js.
- Vercel hosts the application and runs authenticated cron routes for provider catalogue synchronization, bounded order/refill/crypto synchronization, and activation recovery.
- Firebase Authentication supplies customer identity and administrator custom claims.
- Firestore is the authoritative operational database. Firebase Admin performs server-side reads and mutations; browser access is constrained by Firestore rules.
- The repository contains no active Supabase client, environment configuration, migration, or runtime query. Supabase is not part of the production architecture.

### Providers and catalogue

- Followspanel uses its dedicated API client.
- Nitro and SMM World use the standard panel client with their required request encodings.
- Public services are produced from versioned, compact provider snapshots and mapped to provider-neutral public IDs.
- Catalogue quality rules sanitize names, reject non-service/placeholder rows, deduplicate public entries and enforce order eligibility again inside the order transaction.
- Provider submissions are not automatically retried when the outcome is uncertain. Such orders enter `provider_confirmation_required` to prevent accidental duplicate upstream orders.
- `/admin/provider` has a bounded 25-item recovery queue for ambiguous submissions. An administrator must either attach an external order ID that passes a read-only provider-status lookup or attest that the provider dashboard contains no order before the remaining charge is refunded. Recovery never calls the provider `add` operation.
- Provider/order identity pairs are reserved transactionally in a server-only index. Recovery decisions, finance transitions, wallet refunds and notifications use idempotent keys so interrupted work can resume without a duplicate provider order or wallet credit.
- Provider routing, external IDs, provider events and the uniqueness index are server/admin-only. Customer pages and API status responses return provider-neutral order fields.

### Pricing and money

- The required gross-margin target remains 40% (`4,000` basis points).
- Selling price is calculated as `provider cost / 0.60`, in integer minor units with upward rounding.
- Wallets, ledgers, orders, refunds and analytics use integer minor units.
- Flutterwave credits are accepted only after server-side verification of status, amount, currency and reference. Crypto wallet credits require chain verification and explicit administrator approval.
- PayPal funding remains unavailable for NGN wallets; its signed webhook is retained only for safe legacy reconciliation.

### Finance analytics version 2

Authoritative inputs are `orders` for charges/status/provider acceptance, posted NGN `walletTransactions` for deposits/refunds, and current NGN `wallets.availableMinor` for point-in-time customer liability.

Derived values are:

- `net sales = order value - customer refunds`;
- `capital deployed = provider cost on provider-accepted orders only`;
- `gross profit = net sales - capital deployed`;
- `gross margin = gross profit / net sales`, reported as N/A when net sales are zero or negative;
- `active capital = incurred provider cost on non-terminal provider orders`.

All reporting periods use Africa/Lagos calendar boundaries. Last 7/30/90 day ranges include today plus the preceding 6/29/89 calendar days. Current wallet liability is a point-in-time value and is not summed across days.

Normal Finance page loads are read-only and use one global health/total document, at most four compact monthly documents for 90 days, at most 25 recent matching orders, and aggregate queries only for a selected order status.

Historical reconstruction is never triggered by a page view. The explicit administrator action obtains a 30-minute lock, scans orders and ledger transactions in pages of 250, writes versioned daily/monthly/global values, adds canonical finance fields to orders without changing charges/provider IDs/statuses/ledger entries, preserves customer-growth counters, and marks the backfill complete only after all writes succeed. An independent aggregate reconciliation then records MATCH or DRIFT.

Provider cost is recorded only after a provider returns a valid order ID. Creation, provider acceptance, status transitions, wallet entries and refunds remain idempotent. Status rollups compare the stored order status inside the same transaction, allowing legitimate later status cycles while suppressing retries.

## Work completed in this candidate

- Removed page-load finance bootstrapping and false-zero fallbacks.
- Added Finance rollup version 2 with deterministic daily/monthly/global rebuilds and reconciliation metadata.
- Corrected deployed/active capital so pre-provider failures carry zero cost and accepted failed/refunded orders preserve incurred cost.
- Made refund totals ledger-authoritative and persisted per-order refunded amounts for status-filtered reporting.
- Corrected Lagos reporting boundaries and status-filtered totals.
- Added Finance health, reconciliation and controlled rebuild controls.
- Made Excel summary totals authoritative even when 1,000-row detail sheets truncate; labels are provider-neutral and truncation is disclosed.
- Added a central metric quality registry and read-only `/admin/data-quality` page.
- Made reconciliation initialize an absent active-service count cache from the trusted versioned public snapshots without overwriting an existing count or synchronizing providers.
- Replaced misleading sample counts with exact aggregate or exact-cached totals across overview, crypto, support, marketing, provider and operations pages.
- Separated provider configuration, live connectivity, balance, synchronized inventory and last-successful-sync states.
- Preserved compact catalogue snapshots and recorded a deduplicated public-eligible count after successful synchronization.
- Added composite indexes for status/date finance aggregates, all-time status aggregates, provider-accepted cost, NGN transaction aggregates and support totals.
- Preserved the 40% gross-margin rule without changing credentials or production settings.

## Validation status

| Gate | Result |
| --- | --- |
| Regression coverage | Added accepted/rejected/full-refund/partial-refund/Lagos-period/rollup-quality cases |
| Full test suite | Passed after final cache hardening: 27 files / 141 tests |
| TypeScript | Passed after the final cache patch (`tsc --noEmit`) |
| ESLint | Passed after the final cache patch |
| Next.js build | Passed after the final cache patch: optimized bundle, TypeScript, page-data collection and all 88 static pages |
| Firestore index JSON | Valid |
| Diff / whitespace | Passed |
| Tracked-file secret scan | No private-key or common live-token pattern found |
| Production dependency audit | Passed: 0 vulnerabilities |
| Full dependency audit | 25 development-tool advisories (1 moderate, 22 high, 2 critical); some have no available fix and no automatic fix was applied |
| Index deployment/readiness | Passed: deployed index configuration verified READY in `socialbooster-cbcc6` |
| Vercel production deployment | Passed for exact completion commit `73463b6`: deployment `dpl_DKPN1f1xuQCG5ifRSLkocUwmCs9h` is READY and assigned to `www.socialbooster.net.ng` and the other production aliases |
| Production rebuild/reconciliation | Passed: rollup version 2, historical backfill complete, all 10 Finance comparisons and all 5 cross-page comparisons `MATCH` at 15 October 2026 21:36 Africa/Lagos; active services matched 2,310 to 2,310 |

## Workflow verification and safety limits

| Workflow | Current evidence |
| --- | --- |
| Registration / login | Production `/login` and `/register` return successfully; signed-out admin navigation redirects to login. No production account was created. |
| Catalogue / pricing | Snapshot/quality architecture preserved; authoritative public snapshot count is 2,310 and the 40% target remains centralized. No provider sync ran. |
| Orders | Debit, provider acceptance and status accounting were reviewed and compiled. No live order ran. |
| Provider sync | Followspanel, Nitro and SMM World integrations remain in existing configuration. No live sync ran. |
| Wallets / payments / refunds | Ledger remains authoritative and idempotent. No balance or payment changed. |
| Refills / cancellations | Existing ownership/capability checks remain. No provider action was sent. |
| Support / admin | Totals use exact aggregates and bounded lists. Admin claims remain mandatory. The overview displays 2,310 active services from the exact cached snapshot count. |
| Finance rebuild | Controlled, versioned, locked and additive; version 2 backfill completed and every Finance metric reconciled exactly. |

## Firestore read-budget assessment

These are architecture-based upper-bound estimates for a normal page load, not Firebase billing measurements. The production rebuild is excluded because it is an explicit, one-time, data-dependent administrative operation.

| Workflow | Expected reads after repair |
| --- | ---: |
| Admin overview | About 7 by default; below 30 for supported growth ranges |
| Finance dashboard | About 27 by default; below 50, including a selected-status aggregate |
| Support inbox | Up to 28 |
| Crypto administration | Up to 28 |
| Email marketing overview | Up to 27 on a five-minute cache refresh; near zero database reads on a warm cache |
| Acquisition report | Up to 126 documents plus four aggregates on a five-minute cache refresh; no pageview documents |
| Provider administration | Up to 79 Firestore reads plus deliberate live provider calls |
| Manual reconciliation | Low hundreds at the current catalogue shape: compact totals plus provider snapshot chunks |

The rebuild reads every authoritative order and wallet transaction once, performs one wallet aggregate, and writes canonical order fields plus affected daily/monthly/global rollups. The protected UI did not expose its per-operation counters, and the hosting plan's runtime-log retention had expired before those counters were retrieved, so exact rebuild I/O is unavailable in this handoff. Normal request paths remain comfortably below the requested 5,000-read safety target; sustained daily consumption still depends on real traffic and must be checked in Firebase billing/usage telemetry.

**Firebase free-tier safety assessment: PASS for normal application routes**, based on bounded-query architecture and the estimates above; this is not a substitute for production billing telemetry.

## Known issues and follow-ups

There is no remaining Finance release blocker.

1. No browser E2E suite exists. Live checks must remain read-only and avoid financial/provider submissions.
2. README and old setup documents have historical drift and should be reconciled separately.
3. The full dependency audit still reports 25 development-tool advisories (1 moderate, 22 high, 2 critical), including packages without an automatic fix. Production dependencies report zero vulnerabilities.
4. Exact one-time rebuild I/O counters were not recoverable after the short runtime-log retention window; use Firebase usage telemetry for billing evidence.
5. Provider confirmation recovery intentionally depends on a human checking the provider dashboard because the configured provider APIs expose no safe search-by-client-reference operation. Never replace this with automatic resubmission.

## Growth enablement pass — 16 October 2026

The growth pass is additive and does not change core finance, wallet, provider, Firebase catalogue optimization, pricing or payment architecture.

- GA4 now records consented page views plus registration, wallet-funding success, order success, purchase, first-order, repeat-purchase and reseller-interest events. GA4 page views remain browser-only; no Firestore pageview collection or write exists.
- First-touch and last-touch UTM context is sanitized, consent-gated, stored in the browser, submitted during authenticated session establishment and persisted on the customer marketing profile. Referral and reseller intent are essential attribution context with bounded values; referral context expires after 30 days.
- Registration and completed-order transactions update bounded first-touch and last-touch acquisition rollups. Only completed orders add revenue and gross profit. Wallet funding never adds revenue.
- `/admin/acquisition` reports source, medium, campaign, registrations, first orders, repeat orders, net completed-order revenue and authoritative incurred-cost gross profit. Visitor counts remain in GA4 and are labelled `GA4 only`; no Firestore traffic logging was introduced.
- Deterministic unique referral codes, `/r/[code]` attribution, referred registrations, first-completed-order qualification, verified-email/minimum-order/delay/monthly-cap checks and manual reward review are implemented. Signup cannot qualify a reward, self-referrals are rejected by user ID and normalized email hash, and reward approval never credits a wallet automatically.
- `/dashboard/referrals` gives customers their referral link and bounded status counts. `/resellers` now presents wallet, mass-order, API, tracking and onboarding benefits; reseller intent is captured at registration and by the `reseller_interest` analytics event.
- Email lifecycle segments now explicitly include registered-no-order, funded-no-order, first-order, active, at-risk, inactive/dormant, repeat and reseller/API. Bulk marketing remains disabled unless its existing explicit production setting and administrator scheduling gates are satisfied.
- Every guide now links to platform pages, pricing, resellers, API documentation, crypto payment guidance and registration.

Growth-pass validation:

| Gate | Result |
| --- | --- |
| Full test suite | Passed: 29 files / 148 tests |
| TypeScript | Passed: `tsc --noEmit` |
| ESLint | Passed |
| Production build | Passed: compilation, TypeScript, page-data collection and all 88 static pages |
| Diff / whitespace | Passed |
| Live financial/provider testing | Not performed by design |
| Deployment | Not performed; requires a separate authorized release step |

Growth work should continue in small phases:

1. Release the validated candidate without running live payments, orders, provider syncs or referral credits.
2. After release, perform read-only GA4 DebugView and protected-page smoke checks using a test account; do not create financial transactions.
3. Review acquisition rollups and referral fraud flags after real, consented traffic exists; adjust reward rules only through the audited administrator form.

## Provider Confirmation Recovery — 16 October 2026

The recovery pass is layered on top of the preserved Growth Enablement checkpoint and does not change provider submission, payment verification, wallet funding, catalogue synchronization or pricing behavior.

- Ambiguous submissions remain quarantined as `provider_confirmation_required`; they are never automatically retried.
- The administrator recovery queue is independent of the 50-row live-order page, so older ambiguous orders cannot disappear behind pagination.
- Accepted recovery requires the exact upstream order ID, a review note, explicit confirmation and a successful read-only status lookup. A provider-scoped uniqueness record prevents two local orders from claiming the same upstream order ID.
- Rejected recovery requires a review note and explicit confirmation that no upstream order exists. It calculates the unrefunded remainder across automatic, status, administrator and recovery refund keys, then posts one idempotent wallet credit and records the finance transition.
- The generic administrator refund action refuses ambiguous orders, preventing a refund while an upstream order may exist.
- Customer Firestore access to internal order/provider documents is closed. Authenticated server pages and the customer API continue to return only customer-safe order details.
- The provider administration route remains bounded at 50 paginated orders, 25 recovery items, one count and three provider-state documents, plus deliberate live provider status/balance calls.

Combined candidate validation:

| Gate | Result |
| --- | --- |
| Full test suite | Passed: 30 files / 155 tests |
| TypeScript | Passed: `tsc --noEmit` |
| ESLint | Passed with zero warnings |
| Production build | Passed: compilation, TypeScript, page-data collection and all 88 static pages; `/admin/acquisition` and `/admin/provider` present |
| Finance / pricing | Finance regression suite passed; 40% gross-margin tests passed |
| Growth preservation | Acquisition, referral, lifecycle, Firebase-optimization and Firestore-rule regressions passed |
| Live financial/provider testing | Not performed by design |

## Next steps in small phases

### Phase 1 — Routine monitoring

- Check Finance health and the read-only data-quality page after material releases or incidents.
- Use Firebase usage/billing telemetry to validate real traffic consumption against the architecture estimates.
- Run manual reconciliation only when an administrator intentionally requests a fresh comparison.

### Phase 2 — Automated verification

- Add emulator-backed concurrent order-transition, refund and rollup tests.
- Add authenticated browser E2E coverage using non-financial fixtures.
- Add an alert for a stored `DRIFT DETECTED` result without automatically repairing operational data.

### Phase 3 — Maintenance

- Reconcile README/setup documentation.
- Address development-tool advisories in a dedicated upgrade task with full regression testing; do not use an automatic major-version fix on production.
- Keep provider catalogue synchronization on its existing guarded schedule; require explicit authorization for any manual live sync.

## Safety rules for the next session

- Do not reset Git, rewrite history, discard unknown changes or delete files.
- Do not expose Firebase, provider, email, Flutterwave, crypto, cron, analytics or Vercel secrets.
- Do not directly alter wallets, ledgers, payments, balances, orders, refills or provider records.
- Do not trigger real payments, orders, cancellations, refills, crypto approvals or catalogue syncs for validation.
- Preserve integer-minor-unit accounting and the 40% gross-margin rule.
- Treat rollups as caches; authoritative order, ledger and wallet records take precedence.
- If reconciliation does not MATCH, stop and report exact drift; never hide it with manual edits.

## Provider confirmation recovery hardening — 18 October 2026

Baseline before this pass was clean `main` at `43a4a32` (`Add provider confirmation recovery`), already containing Growth Enablement commit `674b585`. This targeted hardening preserves the 40% gross-margin pricing formula, wallet/payment behavior, catalogue sync architecture and all existing growth features.

- Provider order submissions now record explicit `CONFIRMED_ACCEPTED`, `CONFIRMED_REJECTED` or `AMBIGUOUS` outcomes plus bounded safe attempt diagnostics. Network, timeout, response-parse and retryable HTTP failures remain ambiguous and are never automatically resubmitted.
- `/admin/provider` now has an oldest-first, bounded 50-item confirmation queue with an exact aggregate count, provider/age-bucket audit, internal-only diagnostics, read-only verified order attachment, idempotent refund-and-close and a single explicitly confirmed retry. The retry claim is consumed before the one `add` call, never debits the wallet, and cannot loop. A stale interrupted retry claim becomes manually recoverable after ten minutes without permitting another retry.
- The scheduled order job performs one indexed, oldest-first query capped at 50 review orders. It only records one reminder and one escalation stage and sends a bounded idempotent summary; it never calls provider order creation. Including existing live-order/refill limits, the route reads at most 250 queried order/refill documents per run before the existing bounded crypto reconciliation, plus only the review documents that advance an alert stage.
- Three ambiguous submissions for one provider within 15 minutes mark that provider `DEGRADED`, create an operations alert and block new provider-backed orders inside the same pre-debit order transaction. Recovery requires an administrator-triggered successful read-only balance verification. Catalogue history is not altered.
- Customer status remains `Under review` with the exact duplicate-order warning. Customer email and UI contain no provider name, provider ID, error or cost. Admin-only diagnostics retain provider identity. Service names are normalized from HTML entities before the email template escapes them exactly once.
- Unconfirmed orders keep provider capital at zero. Provider acceptance still goes through the existing idempotent, provider-scoped finance transaction. Refund-and-close computes the remaining refundable amount across every existing refund key and credits at most the original customer charge once.
- New server-only Firestore collections are `providerOrderHealth` and `providerSubmissionEvents`. No pageview logging or unbounded historical scan was introduced.

Hardening validation before release:

| Gate | Result |
| --- | --- |
| Full test suite | Passed: 33 files / 165 tests |
| TypeScript | Passed: `tsc --noEmit` |
| ESLint | Passed with zero warnings |
| Production build | Passed: compilation, TypeScript, page-data collection and all 88 static pages |
| Firestore rules | Regression tests passed; Firebase dry-run compiled successfully for `socialbooster-cbcc6` |
| Finance / pricing / growth | Finance, 40% margin, acquisition, referral, lifecycle and Firebase-optimization regressions passed |
| Production dependency audit | Passed: zero vulnerabilities with `npm audit --omit=dev` |
| Full dependency audit | 10 development-tool advisories remain (1 moderate, 7 high, 2 critical); available complete fixes require breaking Vitest/ESLint changes and were not applied automatically |
| Tracked-file secret scan | No private-key or common live-token pattern found |
| Live financial/provider testing | Not performed by design |

Next work should remain phased: (1) monitor the deployed queue and alert stages read-only, (2) add emulator-backed concurrency tests for retry/refund claims, then (3) upgrade development tooling in a separate branch with full regression coverage. Never use the recovery controls without first checking the upstream provider dashboard.

Production release evidence:

- Final Vercel production deployment `dpl_BV2FNrLKrg8v5XsZJf2Q8RnodVhQ` reached `READY` for exact release-handoff commit `78721bbed53f48e9df463545cc5dfed0a116be55` on the existing `socialbooster` project and aliases. It includes provider hardening `5cdc74e` and the verified legacy-entity display fix `f32d853`.
- Firestore rules compiled and were released to existing project `socialbooster-cbcc6`; no indexes or operational documents were deployed or modified by that command.
- Signed-in, read-only production smoke testing confirmed `/admin/provider` loads six `provider_confirmation_required` orders, all in the `>24 hours` bucket and all under Followpanel. Nitro and SMM World each had zero. The page exposed attach, retry-once and refund-and-close controls, while all provider health cards were `ACTIVE` with zero recent ambiguous submissions.
- A post-deployment reload confirmed legacy service names render a normal ampersand rather than literal `&amp;`. `/admin/acquisition` also remained available with first/last-touch source, medium, campaign, registrations, first orders, repeat orders, revenue and gross profit; the page explicitly states wallet funding is never revenue and Firestore does not log pageviews.
- No recovery form was filled or submitted. No provider `add`, payment, wallet credit/debit, refund, referral reward, catalogue sync or customer-data mutation was performed during smoke testing.

## Firestore network egress optimization — 19 October 2026

Baseline before this pass was clean `main` at `9c986d376c930b3e1fedf262e3448cffcdf5703c`. The local release candidate reduces Firestore bytes transferred to Vercel without changing authentication, payments, wallets, orders, provider recovery, Finance, provider pricing, or the required 40% gross margin.

- Provider synchronization now reports whether the public catalogue actually changed. Unchanged daily runs do not invalidate the catalogue cache and do not reread all public snapshots to reconfirm the same exact count.
- A compact global manifest holds exact public count, per-provider counts and hashes, and a stable combined public hash. It updates only with a published catalogue change.
- Public snapshot v3 removes the repeated formulaic description and derives it at render time. The current 3.98 MB snapshot is projected to become 2.34 MB, saving 1.64 MB (41%) per cold reconstruction.
- Public chunks are cached by provider, version/slot, immutable hash, and index without time expiry or broad invalidation. Descriptor and result-page caches no longer force a 24-hour reload. Service detail remains on cached public data.
- The bounded production audit measured 45 public chunks, 25 fingerprint chunks, one support attachment document, and no customer attachment content. Unchanged daily sync falls from an estimated 102 reads / 7.97 MB to 6 reads / 10 KB.
- The support attachment is preserved in place. A future object-storage design is recommended only if volume becomes material; migration is not part of this release.

Full measurements, ranked large-payload findings, cache behavior, planning estimates, and the guarded audit procedure are documented in `docs/FIRESTORE_EGRESS_AUDIT.md`.

Validation for this candidate:

| Gate | Result |
| --- | --- |
| Full test suite | Passed: 34 files / 171 tests |
| TypeScript | Passed: `tsc --noEmit` |
| ESLint | Passed with zero warnings |
| Production build | Passed: compilation, TypeScript, page-data collection, and all 88 generated pages |
| Firebase Rules | Passed: 3 rule regression tests within the full suite |
| Production dependency audit | Passed: zero vulnerabilities |
| Tracked-file secret scan | Passed |
| Production data mutation | None; the audit was bounded and read-only |

The engineering estimate is 15–100 MB/month at current low traffic after release, comfortably below the preferred 1 GiB/month budget and required 10 GiB/month ceiling. The candidate is **SAFE FOR SPARK NEXT MONTH**, subject to comparing at least seven normal post-release days with the Cloud Billing `Cloud Firestore Internet Data Transfer Out` SKU.

Next steps should stay small: (1) review and release this candidate, (2) allow the next guarded provider synchronization to migrate snapshots to v3 without manually triggering a live sync for testing, (3) observe seven days of billing telemetry, then (4) consider a separately tested provider-text bound and object-storage plan only if measurements justify them. This pass is not deployed and has not triggered a provider sync, payment, order, refund, wallet mutation, or attachment migration.

## Production baseline correction and final order-tracking accuracy pass — 20 October 2026

The Firestore egress optimization is already released on GitHub `main` and production at `06faae72fc9d7b4148233ff1b88977cd883167a1`. The preceding section's pre-release sentence is historical and must not be used as current release state. The final order-tracking implementation commit is `6a0225e` and is layered directly on that production baseline.

Architecture and verified progress:

- `synchronizeOrderDocuments()` is the single authoritative persistence path for cron, administrator, customer-list, customer-detail and provider-confirmation recovery checks. It batches at most 100 IDs per provider request and retains the one-minute automatic stale interval.
- A manually verified recovery still performs a read-only provider lookup, provider-scoped uniqueness enforcement and idempotent Finance acceptance. The verified response is then passed through the shared synchronizer immediately, without duplicating normalization rules or making a second provider request.
- Completed status still requires numeric `start_count` and `remains === 0`. Unknown status strings remain conservatively active. Partial, failed and cancelled refunds retain the valid-evidence, two-observation and five-minute delay policy.
- Delivery progress now has one shared calculation. Synchronization persists `startCount`, `remains`, `deliveredQuantity`, `progressPercent`, `lastProviderUpdate` and `lastStatusChange` where supported. Unknown remaining quantity is displayed as waiting rather than fabricated as 0%.
- Confirmed terminal refunds persist refundable quantity, amount, source, transaction ID, timestamp and posted status. Existing refund sources reduce the remaining credit, total refunds cannot exceed the original charge, and the `status-refund:<order>` wallet key remains idempotent.
- Order transition side effects run only when the Finance transaction confirms a real transition. Refund timeline events use a deterministic document ID, so repeated synchronization does not duplicate events.
- Administrator “Refresh live data” now synchronizes and persists a bounded maximum of 100 active provider-backed orders. `/admin/provider` reads stored order truth instead of making transient status calls on every render, and exposes aggregate tracking cards plus bounded status filters.
- Customer list refresh remains limited to the current 20-order page and re-reads that page after persistence. Customer detail remains an ownership-checked one-order refresh. Both customer views remain white-labelled and now expose trustworthy progress/freshness; posted partial refunds show a plain-language wallet-return message.
- Growth Enablement, acquisition reporting, referral attribution, GA4 events, authentication, wallet/payment/provider submission behavior, immutable catalogue caching and the true 40% gross-margin formula were not changed.

Bounded production read-only audit at `2026-10-20T16:43:02Z`:

- Counts: completed 8, partial 0, pending 259, processing 0, in progress 2, needs confirmation 6, failed 7, refund review 0.
- All six unresolved records remain Followpanel `provider_confirmation_required` orders with no provider order ID, start count or remains. They were not retried, refunded or modified.
- Order IDs: `f744676b-eaa3-44c6-a686-1f535e6615e7`, `1cf40047-7038-4d64-bb4b-4d10d7267840`, `449a8ea3-fde2-4dd1-8687-a32a94dbd75f`, `72cc4003-632e-44e6-8484-30264de4fa4c`, `63e6bec9-ae23-4b2b-865d-85bd8b585cc6`, `1561546f-887a-42a9-8c9d-cfbe3816a9f7`.
- Required next action for each is unchanged: an administrator must locate the exact Followpanel order and attach its verified provider order ID. Owner-reported outcomes are not sufficient evidence for an automatic state or wallet change.
- Stored Finance reconciliation is `MATCH`, rollup version 2, last reconciled `2026-10-15T20:36:00.053Z`.

Validation:

| Gate | Result |
| --- | --- |
| Full test suite | Passed: 36 files / 188 tests |
| Firebase Rules | Passed: isolated 3/3 tests |
| TypeScript | Passed: `tsc --noEmit` |
| ESLint | Passed with zero warnings |
| Production build | Passed: compilation, TypeScript, page-data collection and all 88 generated pages |
| Production dependency audit | Passed: zero vulnerabilities |
| Tracked/source secret scan | Passed |
| Finance / pricing / growth | Stored production reconciliation `MATCH`; Finance, 40% margin, acquisition, referral, lifecycle and Firebase-optimization regressions passed |
| Live financial/provider testing | Not performed by design |

Outstanding work in small phases:

1. Release the documentation commit with implementation `6a0225e`, wait for the existing Vercel project to become READY, and perform only non-financial route/error smoke checks.
2. Reconcile the six historical orders one at a time only after locating each exact Followpanel ID. A first partial observation must remain pending confirmation; wait at least five minutes before an intentional second check.
3. Observe scheduled synchronization and Firestore billing for seven normal days. Do not manually trigger provider catalogue synchronization merely for testing.
4. Add emulator-backed concurrent transition/refund coverage in a separate maintenance phase; do not broaden this release.

## Service Description Restoration — 2026-10-21

Baseline `77e8c20` remains the deployed and GitHub starting point for this pass. The candidate restores product meaning without restoring repeated provider descriptions or changing order, wallet, payment, pricing, provider-ID, recovery, attribution, referral or Finance behavior.

Architecture and verified progress:

- `normalizePublicServiceName()` now separates provider noise and unsupported claims from factual product attributes. It preserves Telegram positive/negative/mixed reactions, explicit emoji sets, future-post counts, platform surfaces (post/channel/group/story/reel/profile/video/Shorts/live stream/track/playlist), geography, language and legitimate audience qualifiers.
- Structured runtime semantics drive names, search, duplicate grouping, customer descriptions, `/services`, `/services/[id]`, the order form, API v2 and admin review. Raw provider descriptions are sanitized semantic input only and are never copied to public snapshots or shown to customers.
- Public snapshot v4 stores only short coded semantic fields under `s` (for example platform, kind, variant and target codes). Customer-facing descriptions remain generated at render time. Provider/internal IDs, prices and provider mappings are untouched.
- Duplicate grouping now includes semantic distinctions and emoji code points, so positive, negative, mixed and emoji-specific services cannot collapse into one another.
- Snapshot v4 is migrated only by the next guarded provider synchronization. The manifest switches atomically, immutable chunks remain hash-addressed, v2/v3 read compatibility remains, and the previous v3 slot remains a cross-version fallback.
- The guarded unchanged-catalogue short circuit still returns before fingerprint/public-snapshot reconstruction. Public catalogue reads still use manifest-bounded immutable cached chunks; warm customer catalogue reads remain zero.
- Admin service review now shows raw name/category/description, normalized public name, variant/target/region, generated public description and reason codes. A `SEMANTIC_INFORMATION_LOSS` filter is backed by a dedicated composite index.
- Followpanel description parsing is optional and bounded; Nitro and SMM World retain the same safe optional-description contract. Provider branding, IDs, prices and contact/instruction text are never published.

Bounded production snapshot measurement at `2026-10-21T07:21:54.953Z`:

| Measure | Result |
| --- | --- |
| Current production snapshot | v3, 8,512 provider snapshot rows, 2,329,093 bytes (2.22 MiB) |
| Projected compact semantic v4 | 2,465,812 bytes (2.35 MiB) |
| Difference | +136,719 bytes (+5.9%) |
| Largest projected chunk | 65,353 bytes |
| Warm catalogue | 0 Firestore reads after cache warm-up |
| Unchanged three-provider sync | 6 reads / approximately 10,418 bytes |

Validation:

| Gate | Result |
| --- | --- |
| Full test suite | Passed: 36 files / 198 tests |
| Semantic regressions | Passed: polarity, emoji, audience, country, future posts, surfaces, search, descriptions and duplicate separation |
| Firebase Rules | Passed: isolated 3/3 tests within the full suite |
| TypeScript | Passed: `tsc --noEmit` |
| ESLint | Passed with zero warnings |
| Production build | Passed: compilation, TypeScript, page-data collection and all 88 generated pages |
| Production dependency audit | Passed: zero vulnerabilities |
| Tracked/source secret scan | Passed; deterministic local API-key fixture reviewed |
| Finance / pricing / growth / recovery | Regression suites passed; this pass does not change those paths. Last bounded production reconciliation remains `MATCH` from the 2026-10-20 release audit. |
| Real provider sync/payment/order/refund | Not performed by design |

Next steps stay intentionally small:

1. Commit and push this candidate, deploy the existing Firestore composite index, and allow the existing Vercel project to deploy from `main`.
2. Perform non-financial route/search/detail QA. Production will continue serving compatible v3 data until the next scheduled guarded provider sync publishes v4; do not manually trigger a provider sync merely for testing.
3. After the scheduled migration, re-run the bounded egress audit and verify live positive, negative, mixed and emoji-specific Telegram searches and detail pages without placing an order.
4. Observe Firestore billing and catalogue fallback alerts for seven normal days before considering any further catalogue-storage change.
