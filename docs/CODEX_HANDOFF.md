# Social Booster Codex handoff

Snapshot date: 16 October 2026 (Africa/Lagos)

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
| Firebase project | `socialbooster-cbcc6` |
| Production site | `https://www.socialbooster.net.ng` |
| Working tree | Growth enablement candidate complete and locally verified; not deployed and no production data changed |

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
| Manual reconciliation | Low hundreds at the current catalogue shape: compact totals plus provider snapshot chunks |

The rebuild reads every authoritative order and wallet transaction once, performs one wallet aggregate, and writes canonical order fields plus affected daily/monthly/global rollups. The protected UI did not expose its per-operation counters, and the hosting plan's runtime-log retention had expired before those counters were retrieved, so exact rebuild I/O is unavailable in this handoff. Normal request paths remain comfortably below the requested 5,000-read safety target; sustained daily consumption still depends on real traffic and must be checked in Firebase billing/usage telemetry.

**Firebase free-tier safety assessment: PASS for normal application routes**, based on bounded-query architecture and the estimates above; this is not a substitute for production billing telemetry.

## Known issues and follow-ups

There is no remaining Finance release blocker.

1. No browser E2E suite exists. Live checks must remain read-only and avoid financial/provider submissions.
2. README and old setup documents have historical drift and should be reconciled separately.
3. The full dependency audit still reports 25 development-tool advisories (1 moderate, 22 high, 2 critical), including packages without an automatic fix. Production dependencies report zero vulnerabilities.
4. Exact one-time rebuild I/O counters were not recoverable after the short runtime-log retention window; use Firebase usage telemetry for billing evidence.

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
