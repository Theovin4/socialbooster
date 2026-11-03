# Social Booster Flutterwave remediation — production review

Date: 3 November 2026 (Africa/Lagos)
Canonical repository: `Theovin4/socialbooster`
Baseline: `main` at `f1bb1369cb88c6c36bd86ac980f52e8c1ced79fe`
Release state: local working tree only; not committed, pushed or deployed

## A. Executive summary

The canonical repository was clean before this pass. The earlier temporary adapter was compared with current `main`; its useful gateway contract and bounded audit procedure were reconciled into the canonical tree without replacing newer order tracking, descriptions, Growth Enablement, Finance, pricing or Firebase-optimization work.

Local remediation now provides one atomic payment finalizer for callback, direct webhook, manual reconciliation and shared-gateway delivery. A verified provider transaction is bound to one server-created intent, one customer and one wallet. Wallet balance, transaction, ledger, payment intent, payment event, finance rollups and optional gateway receipts commit together. Conflicting replays fail closed.

The gateway adapter is present but defaults to `off`. Existing callbacks and the direct webhook route remain available. No production environment, Flutterwave dashboard, webhook destination, wallet, payment, order or Firestore record was changed.

## B. Root causes identified

1. Wallet posting was transactional, but intent status and payment-event receipts were written after that transaction. A crash could leave incomplete audit state.
2. The global provider transaction document prevented a second balance credit, but a replay against a different intent could return `duplicate` and then mark the wrong intent paid.
3. Direct webhook authentication accepted either supplied signature. When both V3 and V4 headers were present, one invalid header did not fail the request.
4. Provider verification did not explicitly reject a response whose transaction ID differed from the requested ID or whose reference differed from the requested reference.
5. The direct webhook could treat any authenticated event carrying a transaction ID as a possible credit event. Non-charge events now remain state-only and reversals open review alerts.
6. Customer return recovery queried up to five intents even when the exact reference was known, causing avoidable reads and provider verification calls.
7. A browser could create multiple checkout requests before React disabled the button. Checkout initialization now has a per-attempt idempotency identity and deterministic server-derived reference.
8. Shared-gateway delivery authentication, replay receipts and intent registration were absent from the canonical tree.
9. The three reported live payments required read-only Firestore evidence to distinguish posted credits from current balance changes.

## C. Three Flutterwave transaction reconciliation results

| Provider ID | Reference | Verified provider amount | Customer charge | Result |
| --- | --- | ---: | ---: | --- |
| `2111150666` | `flw_0386da91-7494-478e-8949-0f3383749fcc` | NGN 200 | NGN 204 | **ALREADY_CREDITED** |
| `2111151951` | `flw_e4bea4f4-e21d-4ef4-8998-78d50c544ece` | NGN 1,000 | NGN 1,020 | **ALREADY_CREDITED** |
| `2112136892` | `flw_83d0e15a-c158-4571-89b4-e4973be69ee3` | NGN 1,500 | NGN 1,530 | **ALREADY_CREDITED** |

The read-only production run confirmed matching paid intents, posted wallet transactions and ledger entries totaling NGN 2,700, with no duplicate transaction/reference usage. Historical `paymentEvent` documents are absent and wallet-transaction `providerTransactionId` fields are null; canonical document IDs and references prove the stored identity. These are audit/observability gaps only. Existing provider verification reports three successful transactions; fees/customer gateway fees are not wallet credit. Production writes performed: **0**.

## D. Wallet security findings

- Successful credit requires provider status, exact provider transaction ID, exact reference, provider, amount and currency to match the server-owned intent.
- A provider transaction document ID is globally unique. Existing effects must also match customer, reference, amount, currency, status and ledger or processing stops.
- Callback/webhook races and concurrent attempts serialize through a Firestore transaction.
- Failed, pending, refund, reversal and unknown event types cannot enter the credit path.
- Gateway delivery ID and event ID receipts are persisted with the financial effect. A 2xx response follows durable completion only.
- Existing legitimate wallet history is appended to, never recalculated or replaced.
- No automatic refund or reversal debit was introduced. Such events become review evidence.

## E. Fixes implemented locally

Changed files:

- `.env.example`
- `firestore.rules`
- `package.json`
- `package-lock.json`
- `src/app/api/admin/finance/export/route.ts` and `route.test.ts`
- `src/app/api/internal/flutterwave-gateway/route.ts`
- `src/app/api/payments/flutterwave/callback/route.ts`
- `src/app/api/payments/flutterwave/initialize/route.ts`
- `src/app/api/webhooks/flutterwave/route.ts`
- `src/app/api/webhooks/paypal/route.ts`
- `src/app/dashboard/wallet/page.tsx`
- `src/components/fund-wallet.tsx`
- `src/lib/firebase/firestore-rules.test.ts`
- `src/lib/payments/checkout.ts` and `checkout.test.ts`
- `src/lib/payments/credit.ts` and `credit.test.ts`
- `src/lib/payments/flutterwave.ts` and `flutterwave.test.ts`
- `src/lib/payments/gateway.ts` and `gateway.test.ts`
- `src/app/api/webhooks/flutterwave/route.test.ts`
- `src/app/api/payments/flutterwave/callback/route.test.ts`
- `src/app/api/internal/flutterwave-gateway/route.test.ts`
- `src/app/admin/transactions/actions.ts` and `page.tsx`
- `src/components/payment-diagnostic.tsx`
- `src/lib/payments/diagnostics.ts`, `diagnostics-server.ts` and `diagnostics.test.ts`
- `scripts/reconcile-flutterwave-readonly.mjs`
- `docs/FLUTTERWAVE_READ_ONLY_RECONCILIATION.md`
- `docs/FLUTTERWAVE_REMEDIATION_REVIEW.md`
- `docs/CODEX_HANDOFF.md`

## F. Shared gateway integration status

- Server intent registration supports `off`, `shadow` and `enforce`; invalid mode values resolve to `off`.
- Registration uses timestamp, nonce and HMAC with a dedicated registration secret. `enforce` fails before Flutterwave checkout; `shadow` reports failure while preserving current checkout continuity.
- Delivery uses a different per-application secret, five-minute timestamp tolerance, application/delivery binding, strict payload schema and 64 KiB limit.
- Gateway secrets are rejected if reused from the Flutterwave API key or webhook hash.
- Financial delivery requires trusted intent ownership and exact amount/currency, then uses the atomic finalizer.
- The internal delivery endpoint rejects all deliveries when mode is `off`. Production has no shared-gateway environment variables configured, so the mode defaults to `off`.
- Legacy intents remain compatible because callbacks and direct webhooks do not require gateway registration.
- Production must remain `FLUTTERWAVE_GATEWAY_MODE=off` until the independent gateway database and all four staging adapters pass the shared audit plan.

Required environment variable names, without values:

- `FLUTTERWAVE_GATEWAY_MODE`
- `FLUTTERWAVE_GATEWAY_URL`
- `FLUTTERWAVE_GATEWAY_REGISTRATION_SECRET`
- `FLUTTERWAVE_GATEWAY_DELIVERY_SECRET`

## G. Firestore cost optimization

- Customer return with an exact reference uses one intent document read before any provider call. The legacy five-intent query is retained only for old return URLs without a reference.
- A direct verified NGN credit uses two preflight exact reads plus five transactional exact reads. It writes wallet, transaction, ledger, intent and event plus the existing finance rollups. The extra ledger/event reads detect inconsistent or conflicting historical effects.
- A gateway financial delivery adds two exact receipt reads and two receipt writes. A state-only gateway delivery uses one exact intent read, two exact receipt reads and three receipt/event writes, plus one alert write only for reversal-like states.
- No collection scan, polling, realtime listener or pageview logging was added. Duplicate deliveries make no balance or rollup increment.
- The admin complaint diagnostic is read-only, requires an admin session, limits displayed matches to five and later activity to 25 entries, and does not call the provider API or expose credentials.
- Wallet funding is recorded as deposits and wallet liabilities; it is not included in order revenue or gross margin.
- At current payment volume, the incremental read/write cost is negligible compared with the financial-integrity benefit.

## H. Customer payment experience improvements

- Checkout attempts are idempotent and the button remains disabled while initialization is in flight.
- A failed initialization states that no wallet credit was created and supplies safe retry guidance.
- The callback returns the exact reference. The wallet page checks that exact server-owned intent and shows success only when paid.
- Pending status explicitly says the wallet has not yet been credited.
- Failure messages expose no Flutterwave secret, gateway secret, Firebase credential or customer identity.
- Existing responsive wallet layout and payment methods were preserved.
- Admin Transactions now shows provider ID/reference, intent, expected amount, deposit and ledger balances, bounded later activity, current wallet balance, payment events and an evidence-based classification. It explicitly distinguishes **PAYMENT NOT CREDITED** from **PAYMENT CREDITED AND LATER SPENT**.

## I. Tests and build results

| Gate | Result |
| --- | --- |
| Focused payment/gateway/webhook/diagnostic matrix | 54/54 passed |
| Full regression suite | 47 files / 277 tests passed |
| Firebase / Firestore tests | 26/26 passed; Rules 3/3 included |
| TypeScript | Passed |
| ESLint | Passed |
| Production build | Passed; 90 pages generated |
| Production dependency audit | 6 moderate, 0 high, 0 critical; temporarily accepted upstream risk documented in `SECURITY_DEPENDENCY_RISK.md` |
| Secret-pattern scan | Passed; no known credential patterns found |
| Read-only audit fail-closed check | Passed: exits before Firebase access when viewer credential/project ID are absent |
| Production Vercel Node runtime | 24.x; satisfies Firebase Admin / Firestore `>=22` |
| Shared gateway | Off; no gateway mode variables are configured in production and code defaults to off |

No test initiated a real Flutterwave payment, wallet credit, refund, provider order or production Firestore mutation.

### Dependency audit findings and safe-fix assessment

The original production audit reported 12 findings (11 moderate and 1 high). ExcelJS 4.4.0 was the only direct vulnerable production dependency and was used only by the admin Finance XLSX export. It was replaced with `@e965/xlsx` 0.20.3, and an export round-trip test verifies the four sheets, financial values, currency/date formats, filters, column widths and non-revenue deposit definition. RE2JS moved from 2.8.6 to 2.9.1 within Firebase's declared `^2.8.3` range. Across the spreadsheet replacement, compatible security updates and supported Google SDK refresh, the lockfile has 24 version updates, 87 removed package entries, 3 added entries and no major-version changes.

The export remains an XLSX with the same data and filters. The replacement library does not retain ExcelJS cell styling, frozen header rows or wrapped definition cells, so those presentation details are not preserved.

The initial supported npm update kept `firebase-admin@14.5.0` and resolved
`@google-cloud/firestore@9.4.0`. The linked Vercel project and package engine
are both Node 24.x. Firestore 9.4.0 itself declares
`@google-cloud/firestore-api@^0.2.0`; therefore the latest 0.7.1 package cannot
be selected through the supported range. The remaining six production findings
are transitive and present in the Firebase Admin / Firestore runtime dependency
tree. Their dependency path is:

`firebase-admin@14.5.0` → `@google-cloud/firestore@9.4.0` → `@google-cloud/firestore-api@0.2.0` → `google-gax@5.0.8` / `google-auth-library@10.5.0` → `gcp-metadata@8.1.4` → `gaxios@7.1.3` → `rimraf@5.0.10` → `glob@10.5.0` → `minimatch@9.0.9`

| Package | Installed | Classification | Advisory | Fix availability and compatibility |
| --- | --- | --- | --- | --- |
| `glob` | 10.5.0 | Transitive production | GHSA-3g3m-2fjr-6pw4, moderate | npm reports a fix; patched 14.0.2 is outside `rimraf@5`'s `^10.3.7` range |
| `minimatch` | 9.0.9 | Transitive production | GHSA-g3hv-75wg-m249, moderate | npm reports a fix; patched 11.0.1 is outside `glob@10`'s `^9.0.0` range |
| `rimraf` | 5.0.10 | Transitive production | Inherits vulnerable `glob` | Patched `rimraf@6` changes major and is outside both parents' `^5.0.1` ranges |
| `gaxios` | 7.1.3 (nested); 7.3.1 / 8.3.2 elsewhere | Transitive production | Inherits vulnerable `rimraf` | 7.1.4 removes `rimraf`, but `gcp-metadata@8.1.4` pins gaxios exactly to 7.1.3 |
| `gcp-metadata` | 8.1.4 (nested); 9.2.3 elsewhere | Transitive production | Inherits vulnerable `gaxios` | Current supported auth path uses 9.2.3; Firestore API's auth path retains 8.1.4 |
| `google-gax` | 5.0.8 (nested); 6.12.1 elsewhere | Transitive production | Inherits vulnerable `rimraf` | Firestore API 0.2.0 only accepts `^5.0.0`, not fixed major 6.x |

`npm audit fix` was run without `--force`; it left this chain unchanged. A
supported `npm update firebase-admin @google-cloud/firestore google-auth-library`
then refreshed Firestore to 9.4.0 and auth metadata packages, but retained the
Firestore API 0.2.0 chain due to the parent's declared range. The code has no
direct imports of the affected utility packages; their presence in the
production Firebase tree is not treated as proof of non-applicability. No
override or incompatible internal pin was added. This bounded, moderate risk is
temporarily accepted under the release criteria and documented with a review
date in `SECURITY_DEPENDENCY_RISK.md`.

The finance export replacement preserves the four sheets, data, filters,
column widths, currency/date number formats and definitions, with a round-trip
test. The current library does not implement ExcelJS cell styling or frozen
panes; these cosmetic differences do not affect workbook readability or data.

## J. Remaining blockers

1. Independent gateway database/staging certification remains out of scope; production gateway mode stays `off`.
2. No historical credit or production Firestore mutation was performed.

## K. Production deployment and rollback plan

1. Reconciliation is complete; retain the sanitized result in the access-controlled incident record.
2. The production-only audit retains six moderate upstream findings, temporarily accepted and documented under the release criteria.
3. Commit only payment-remediation paths, required dependency changes and risk documentation; push `main`, and deploy the existing Social Booster Vercel project with mode `off`; then run no-payment smoke checks.
4. Shared gateway staging/enforcement and LIVE Flutterwave webhook changes remain separate future approvals.

Rollback: set registration mode to `off`, preserve callbacks and restore the previously recorded LIVE webhook URL only with owner approval. Do not delete gateway inbox/outbox, receipts, intents, ledger entries or reconciliation evidence. Reconcile every in-flight delivery before a later retry.

## L. Exact approval required

The user explicitly authorized a scoped commit, push to `main`, and production deployment if the audit has no high/critical findings or qualifies for the documented moderate-only acceptance case. No financial correction, gateway enablement, staging migration or LIVE Flutterwave webhook cutover was performed or authorized.

## Final status

**SOCIAL BOOSTER PAYMENT REMEDIATION — upstream moderate risk accepted; release validation passed**
