# Social Booster Codex handoff

Snapshot date: 14 October 2026 (Africa/Lagos)

## Recovery summary

The previous Codex task ended during remote context compaction, but its work was not lost. The original checkout is intact, clean, pushed, and deployed.

| Item | Recovered state |
| --- | --- |
| Repository | `C:\Users\USER\Documents\social booster` |
| Branch | `main` |
| Upstream | `origin/main` |
| Git remote | `https://github.com/Theovin4/socialbooster.git` |
| Current commit | `85fff98cefe4dfed2d150a697b732ced16dcf5e5` |
| Commit title | `Complete final production quality pass` |
| Working tree | Clean; no staged, unstaged, or untracked files before this handoff document |
| Vercel project | `socialbooster` (`prj_5oXhNKTwO6E4Y8bSYtYK0v6OclEm`) |
| Production deployment | `dpl_GCUBgnJPPDAzpRBiDjvFEvtsKwCB`, state `READY` |
| Production aliases | `www.socialbooster.net.ng`, `socialbooster.net.ng`, and the connected Vercel aliases |

No deployment, provider synchronization, order, refill, wallet mutation, customer-data mutation, or financial transaction was triggered during recovery.

## Catalogue-safety continuation

The recovered baseline commit remains `85fff98cefe4dfed2d150a697b732ced16dcf5e5`. The current working candidate is a small catalogue-sanitization patch based on that commit; record its final commit hash from `git log -1 --oneline` after the verified commit is created.

The patch strengthens the existing shared service-quality engine rather than creating page-specific filters. It now returns an eligibility decision, stable reason codes, normalized public name/category, pricing status, and compliance status. The same engine is used during provider synchronization, as a zero-additional-read guard when cached public snapshot rows are loaded, and inside the authoritative order transaction before any wallet debit. Consequently, public catalogue/search/pricing/platform/API consumers share one filtered catalogue, while direct web, API, and mass-order IDs are independently revalidated at order time.

Confirmed regression coverage includes:

- `AUDIOMACK SERVICES` with quantity `1–1` is classified as `NON_SERVICE_RECORD`, `UNMAPPED_CATEGORY`, and `PRICE_ANOMALY`;
- NGN 495,682,687,500, NGN 55,075,853,616.67, and contextual NGN 5,507,584,866.67 placeholder prices are rejected;
- a meaningful high-priced service is not rejected merely for being expensive;
- Apple Music and Audiomack categories are canonicalized, duplicated countries/worldwide labels are removed, unsupported provider claims are not promoted, and the confirmed malformed names receive clean public labels;
- stale bad rows are removed from the next immutable public snapshot and are also filtered at read time without scanning the `services` collection;
- stored service cost, selling price, limits, activity, eligibility, and compliance are rechecked before transactional wallet writes;
- the required selling-price formula remains `provider cost / 0.60`, using integer minor units and upward rounding.

Catalogue quality ruleset version `3` deliberately forces one bounded snapshot rebuild even when provider catalogue hashes are otherwise unchanged. The migration reuses provider results plus compact fingerprint/snapshot state; it does not read or rewrite all service documents. Raw provider names/categories remain internal for diagnosis, and admin catalogue health displays normalized output, provider cost, selling price, public ID, and reason codes. Existing governance changes remain explicit and audit logged.

### Verification for this candidate

| Gate | Result |
| --- | --- |
| Unit/integration tests | 25 files passed; 120 tests passed (baseline was 109) |
| Firebase Rules tests | 2 passed within the full suite |
| TypeScript | Passed (`tsc --noEmit`) |
| ESLint | Passed |
| Production build | Passed; 88 routes generated |
| Production dependency audit | Passed; 0 vulnerabilities with `npm audit --omit=dev` |
| Full dependency audit | 10 development-tool advisories (1 moderate, 7 high, 2 critical); automated remedies require major/incompatible Vitest or ESLint changes and were not folded into this small patch |
| Secret scan | No private-key or common live-token patterns found in tracked files |
| Diff check | Passed; no whitespace errors |

No real payment, wallet mutation, order, refill, cancellation, provider submission, or customer-data write was used for verification. The authorized post-deployment catalogue synchronization must run only after the Git/Vercel deployment is healthy; its result and live catalogue counts should be captured in the final release report.

## Current architecture

### Application and hosting

- Next.js 16 App Router, React 19, TypeScript, Node.js 24.
- Vercel hosts the application and runs three authenticated cron routes:
  - daily service/provider synchronization;
  - bounded order, refill, and crypto-verification synchronization;
  - bounded account-activation recovery email processing.
- Security headers, HSTS, CSP, clickjacking protection, content-type protection, referrer policy, and permissions policy are emitted in production.

### Identity and data

- Firebase Authentication handles email/password and Google sign-in.
- The server exchanges a recent Firebase ID token for the HTTP-only `sb_session` cookie and checks revocation on protected operations.
- Firestore is the active production database. Firebase Admin performs authoritative mutations; browser clients are restricted by `firestore.rules`.
- Wallets, payment intents/events, orders/events, refills, support tickets/messages, provider services, audit logs, notifications, and analytics rollups are stored in Firestore.
- Admin access requires a verified Firebase custom claim (`admin: true`).
- The `supabase/migrations` directory is empty. There is no Supabase dependency, environment variable, client, query, migration, or runtime reference. Supabase is not part of the active architecture and should not be introduced during recovery without an explicit migration project.

### Provider integrations

- Followspanel uses the dedicated `FollowsPanelClient` and defaults to `https://followspanel.com/api/v2`.
- Nitro uses the standard panel client with form-encoded requests and defaults to `https://nitro.ng/api/v2`.
- SMM World uses the standard panel client with JSON requests and defaults to `https://my.smmworld.org/api/v2`.
- Provider reads may retry with backoff; order/refill/cancel submissions deliberately do not retry automatically.
- Provider service identifiers are namespaced where needed, provider identities are hidden behind public `SB-*` identifiers, and the public catalogue is read from versioned Firestore snapshot chunks with a previous-good fallback.
- Synchronization is bounded, locked, fingerprinted, and short-circuits unchanged catalogues. The prior completed production pass reported all three providers successful. Recovery did not rerun synchronization because it would mutate production state and contact live providers.

### Pricing and money

- The mandatory target is a 40% gross margin (`4,000` basis points).
- The authoritative formula is `selling price = provider cost / (1 - 0.40)`, rounded up to the nearest minor unit.
- Example: a provider cost of NGN 1,000 produces a selling price of approximately NGN 1,666.67.
- The rule is centralized in `src/lib/money.ts` and reused by provider synchronization, order creation, and admin price-reset paths.
- Orders persist provider cost, customer price, gross profit, target margin, actual margin, markup, currency, and pricing-model metadata.
- Wallet balances and ledger entries use integer minor units and Firestore transactions. Idempotency keys prevent duplicate deposits, debits, refunds, and administrative adjustments.

### Payments

- Flutterwave is the active hosted-checkout wallet-funding integration when `PAYMENTS_ENABLED=true`.
- Initialization creates a server-side payment intent. Callback and webhook paths verify the provider transaction, status, amount, currency, and transaction reference before invoking the same idempotent credit function.
- PayPal initialization is intentionally disabled for NGN wallets, and its callback only redirects to an unavailable state. The signed webhook remains for safe reconciliation of legacy PayPal intents and reversals.
- Crypto funding supports USDT on TRC20, BEP20, and Solana plus BTC. Quotes expire, transaction hashes are deduplicated, chain data is verified, and wallet credit requires an administrator approval that re-verifies the transaction.
- No real or sandbox financial transaction was initiated during recovery.

### Orders, refills, support, and administration

- Order creation validates service availability, compliance/price state, quantity, URL, wallet currency, and funds inside a transaction before one provider submission.
- Definite provider rejection triggers an idempotent refund; uncertain network outcomes enter `provider_confirmation_required` to prevent duplicate provider orders.
- Order synchronization is grouped by provider and bounded to 100 orders per cron execution. Terminal refunds require confirmed, valid provider data.
- Refill and cancellation actions require ownership and service capability flags. Refill status polling is bounded to 100 items per cron execution.
- Dashboard support tickets enforce ownership, validate attachments, store ticket/message records atomically, and notify customer/admin. Admin replies and status changes require the admin claim.
- Admin routes cover overview, services, provider operations, finance, wallets, transactions, crypto approvals, support, SEO, email marketing, and operational metrics.

## Most recent completed work

Commit `85fff98` contains the interrupted task's final production-quality changes:

- consolidated legacy PayPal webhook credits through the authoritative payment-credit function and disabled the unsafe/unavailable PayPal return flow;
- expanded service catalogue quality, compliance, duplicate, pricing-anomaly, and public-name normalization rules;
- enforced public eligibility during synchronization and removed stale public entries when a service becomes ineligible;
- preserved the centralized 40% gross-margin calculation throughout sync and ordering;
- made mass-order processing continue safely after individual row failures and report no-charge failures accurately;
- added refund-confirmation safeguards for terminal provider statuses;
- added privacy-safe, deduplicated analytics for registration, catalogue, orders, and support events;
- improved customer order status and provider-operation handling;
- refreshed sitemap dates and production-facing service categories.

The preceding production release, `9b274fe`, hardened dependencies and the Resend webhook. Earlier commits added bounded Firestore reads, compact catalogue snapshots, provider fingerprints, wallet/refund auditing, provider-ID masking, and gross-margin standardization.

## Verification performed during recovery

### Automated gates

| Gate | Result |
| --- | --- |
| Unit/integration tests | 25 files passed; 109 tests passed |
| TypeScript | Passed (`tsc --noEmit`) |
| ESLint | Passed |
| Production build | Passed; 88 routes generated |
| Git after checks | Clean; `HEAD` and locally recorded `origin/main` both at `85fff98` |

The test suite covers money and gross margin, provider parsing, service quality, service synchronization, wallet idempotency, Firestore rules, Firebase admin safeguards, Flutterwave verification primitives, crypto calculations, refunds, customer API behavior, pagination, order statuses, email policy, analytics safety, marketing, mass orders, and support attachments.

### Live read-only checks

- The latest Vercel production deployment is `READY`, sourced from `main` at commit `85fff98`.
- The homepage, services catalogue, pricing, login, and registration pages rendered successfully.
- The live catalogue returned 12,298 matching public services and displayed NGN prices, limits, public identifiers, and refill availability.
- Signed-out `/dashboard` and `/admin` requests redirected to `/login`.
- `robots.txt`, `sitemap.xml`, and `llms.txt` returned HTTP 200 through Vercel's read-only fetch path.
- The sitemap index referenced pages, platforms, Africa, guides, and service sitemaps.
- No authenticated form was submitted and no production mutation was attempted.

## Workflow status and limits

| Workflow | Recovery status | Evidence / limitation |
| --- | --- | --- |
| Registration | Structurally verified | Live form rendered; Firebase create-user, profile update, verification email fallback, session exchange, and post-login bootstrap compile. No production account was created. |
| Login | Structurally verified | Live email/password and Google controls rendered; protected pages redirected correctly. No credentials were used. |
| Service catalogue | Verified read-only | Live catalogue returned 12,298 services; snapshot loading, search, pagination, detail resolution, and quality rules pass build/tests. |
| Pricing | Verified locally and live | Live NGN prices render; all nine money tests pass; 40% gross-margin formula remains authoritative. |
| Orders | Verified by code/tests only | Transactional debit, idempotency, provider submission, uncertain-outcome handling, and refund paths pass available checks. No live order was placed. |
| Provider synchronization | Recovered, not rerun | Three providers are configured in code; prior release evidence reports 3/3 successful. A recovery-time sync would have mutated Firestore and contacted providers. |
| Wallets | Verified by code/tests only | Six wallet tests pass; transaction/ledger/audit writes are transactional and idempotent. No balance was changed. |
| Payment verification | Verified by code/tests only | Flutterwave signature/reference primitives and centralized credit checks pass. No payment was initialized or verified against a real transaction. |
| Crypto funding | Verified by code/tests only | Quote/credit tests pass; final credit requires chain re-verification and admin approval. No quote or transaction was submitted. |
| Refills/cancellations | Structurally verified | Ownership, capability flags, deduplication, confirmation-required states, notifications, and bounded polling are present. No provider action was triggered. |
| Support tickets | Structurally verified | Customer/admin authorization, attachment validation, atomic writes, email notifications, and status controls compile; attachment tests pass. No ticket was created. |
| Admin operations | Access boundary verified | Signed-out access redirects to login; admin claim checks are centralized. Authenticated admin workflows were not exercised without an authorized test account. |

## Known issues and documentation drift

1. `README.md` is still the default Create Next App text and does not describe the production system.
2. `docs/LAUNCH_CHECKLIST.md` still contains unchecked items that conflict with later verified release work and should be reconciled rather than treated as current truth.
3. `docs/PAYPAL_SETUP.md` describes active PayPal checkout, but PayPal initialization is now intentionally unavailable for NGN wallets. The document should be rewritten as legacy-webhook/reconciliation guidance or archived.
4. The setup documents still use the older `socialbooster-sigma.vercel.app` address in examples. The canonical production URL is `https://www.socialbooster.net.ng`.
5. No browser end-to-end test suite is configured in `package.json`; authenticated workflows currently rely on unit/integration coverage, compilation, manual checks, and guarded production verification.
6. The live catalogue sample still contains some awkward provider-derived names and near-duplicate entries. The latest quality rules are deployed, but the next controlled provider sync should be observed to confirm the new rules fully republish the catalogue without exposing ineligible services.
7. The prior release reported 12,356 provider services processed, while the current public catalogue shows 12,298 matching services. This can be normal provider churn or stricter quality filtering, but it should be reconciled from provider-sync metrics before any catalogue intervention.
8. Machine-readable routes were blocked by the local in-app browser client, but independent Vercel fetches returned HTTP 200. This was a verification-tool limitation, not a confirmed site outage.

## Outstanding work, split into small phases

### Phase 1 — Documentation reconciliation (safe, no production mutation)

- Replace the starter README with the recovered architecture, setup, verification, and rollback summary.
- Update the launch checklist from current evidence and mark externally owned checks explicitly.
- Rewrite PayPal documentation to match the intentionally disabled NGN checkout and legacy webhook behavior.
- Update old example domains to the canonical production domain.
- Run lint, typecheck, tests, and build; commit only documentation changes separately.

### Phase 2 — Authenticated non-financial QA (requires an authorized test account)

- Verify registration, email verification, password reset, email/password login, Google login, session expiry, and logout.
- Verify customer catalogue search, pagination, service details, profile/preferences, support ticket creation/reply/close, and attachment authorization.
- Verify admin claim enforcement and read-only admin dashboards.
- Do not use customer accounts or real personal data.

### Phase 3 — Provider and catalogue observation (controlled production window)

- Capture current provider balances, sync state, catalogue hashes, read/write metrics, and previous-good snapshot metadata.
- Run at most one authorized manual synchronization or observe the scheduled run.
- Confirm 3/3 provider outcomes, service counts, quality-filter counts, public snapshot publication, and 40% gross-margin invariants.
- Sample public names and duplicates after the sync; fix only reproducible normalization defects with focused tests.

### Phase 4 — Payment and wallet sandbox verification

- Use Flutterwave test mode and a dedicated test user/wallet.
- Verify initialization, callback, signed webhook, wrong reference, wrong amount, duplicate event, recovery, and exactly-once wallet credit.
- Exercise crypto only with explicitly approved test assets/networks; never send funds to production addresses for routine QA.
- Reconcile payment intents, events, wallet transactions, immutable ledger records, emails, and audit entries after each case.

### Phase 5 — Order/refill sandbox verification

- Select one permitted low-value provider service using an approved test wallet.
- Verify exactly-once debit and provider submission, status synchronization, cancellation capability handling, refill creation/status, and terminal refund confirmation.
- Stop immediately on an uncertain provider response; use existing `provider_confirmation_required` recovery instead of resubmitting.

### Phase 6 — Release only confirmed fixes

- Keep fixes narrowly scoped and covered by a regression test.
- Re-run all four quality gates.
- Review the Git diff and confirm no secrets, customer data, generated credentials, or environment values are tracked.
- Obtain explicit authorization before deploying or performing any live financial/provider mutation.
- Record the new commit and deployment IDs in this handoff.

## Safety rules for the next session

- Do not reset Git, discard unknown changes, delete files, or rewrite history.
- Do not migrate Firebase/Firestore to Supabase as part of recovery.
- Do not expose Firebase Admin, provider, Resend, Flutterwave, PayPal, crypto-provider, cron, analytics, or Sentry secrets.
- Do not modify wallets, ledger records, payment intents/events, orders, refills, provider services, or customer records directly in production.
- Do not weaken payment verification, ownership checks, admin-claim checks, webhook signatures, idempotency, or audit logging.
- Preserve the 40% gross-margin formula and integer-minor-unit money model.
- Do not deploy, run a manual provider sync, place an order, submit a refill/cancellation, approve crypto, or initiate a real payment without explicit authorization and a rollback/reconciliation plan.

