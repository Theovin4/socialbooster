# Social Booster Codex handoff

Snapshot date: 15 October 2026 (Africa/Lagos)

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
| Firebase project | `socialbooster-cbcc6` |
| Production site | `https://www.socialbooster.net.ng` |
| Working tree | Production Finance was rebuilt and reconciled; a focused missing catalogue-count cache initializer is awaiting release and final verification |

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
| Vercel production deployment | Passed for exact commit `984df3b`: deployment `dpl_2BLjMrf8rDfoaZqk6MjvWRa5q87U` is READY and assigned to the production domains |
| Production rebuild/reconciliation | Rollup version 2 and historical backfill completed. All Finance values and all available cross-page values match; the pre-existing active-service cache was unavailable and its safe initializer is pending release. |

## Workflow verification and safety limits

| Workflow | Current evidence |
| --- | --- |
| Registration / login | Production `/login` and `/register` return successfully; signed-out admin navigation redirects to login. No production account was created. |
| Catalogue / pricing | Snapshot/quality architecture preserved; authoritative public snapshot count is 2,310 and the 40% target remains centralized. No provider sync ran. |
| Orders | Debit, provider acceptance and status accounting were reviewed and compiled. No live order ran. |
| Provider sync | Followspanel, Nitro and SMM World integrations remain in existing configuration. No live sync ran. |
| Wallets / payments / refunds | Ledger remains authoritative and idempotent. No balance or payment changed. |
| Refills / cancellations | Existing ownership/capability checks remain. No provider action was sent. |
| Support / admin | Totals use exact aggregates and bounded lists. Admin claims remain mandatory. |
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

The rebuild reads every authoritative order and wallet transaction once, performs one wallet aggregate, and writes canonical order fields plus affected daily/monthly/global rollups. Its exact cost must be recorded from the production result rather than estimated. Normal request paths remain comfortably below the requested 5,000-read safety target; sustained daily consumption still depends on real traffic and must be checked in Firebase billing/usage telemetry.

## Known issues and release blockers

1. Deploy the focused missing-cache initializer and rerun reconciliation so the exact 2,310-service snapshot count becomes available to the Admin overview without a provider sync.
2. No browser E2E suite exists. Live checks must remain read-only and avoid financial/provider submissions.
3. README and old setup documents have historical drift and should be reconciled separately.
4. Do not apply automatic major-version dependency fixes inside this focused Finance patch.

## Next steps in small phases

### Phase 1 — Final local gate

- Re-run TypeScript, ESLint and all tests where child-process execution is available.
- Run production/full dependency audits without automatic fixes.
- Review the final diff for secrets, credentials and production data.

### Phase 2 — Index-first release

- Deploy only `firestore.indexes.json` to `socialbooster-cbcc6`.
- Wait for every new index to report READY.
- Do not run the Finance rebuild while indexes are building.

### Phase 3 — Application release

- Commit and push the focused patch to `main`.
- Require a successful Vercel build from that exact commit.
- Confirm public routes and signed-out protection without form submissions.

### Phase 4 — Controlled production reconciliation

- Sign in with an authorized administrator account.
- Run reconciliation first; if drift/version unavailable, run one controlled rebuild.
- Confirm version 2, backfill complete and reconciliation MATCH.
- Record reads, writes, dates, totals and timestamps. Never edit ledger/order totals manually.

### Phase 5 — Read-only cross-page QA

- Verify Finance ranges/status filters/export and all admin metric labels/freshness.
- Inspect runtime logs for missing-index, permission, serialization or reconciliation errors.

### Phase 6 — Separate follow-up

- Add emulator-backed concurrent transition tests and authenticated browser E2E coverage.
- Reconcile README/setup documentation.
- Address development-tool advisories only in a dedicated upgrade task.

## Safety rules for the next session

- Do not reset Git, rewrite history, discard unknown changes or delete files.
- Do not expose Firebase, provider, email, Flutterwave, crypto, cron, analytics or Vercel secrets.
- Do not directly alter wallets, ledgers, payments, balances, orders, refills or provider records.
- Do not trigger real payments, orders, cancellations, refills, crypto approvals or catalogue syncs for validation.
- Preserve integer-minor-unit accounting and the 40% gross-margin rule.
- Treat rollups as caches; authoritative order, ledger and wallet records take precedence.
- If reconciliation does not MATCH, stop and report exact drift; never hide it with manual edits.
