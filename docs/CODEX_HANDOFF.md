# Social Booster Codex handoff

Snapshot date: 19 October 2026 (Africa/Lagos)

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
