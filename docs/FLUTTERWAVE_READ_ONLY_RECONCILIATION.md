# Flutterwave wallet reconciliation (read only)

## Completed reconciliation — 3 November 2026

The bounded Firestore reconciliation completed using Windows ADC impersonating `socialbooster-reconcile-viewer@socialbooster-cbcc6.iam.gserviceaccount.com` in project `socialbooster-cbcc6`. Firestore reads succeeded and a non-mutating IAM permission check returned no Firestore/Datastore write permissions. Production writes: **0**.

| Flutterwave transaction | Wallet credit | Firestore result |
| --- | ---: | --- |
| `2111150666` | NGN 200 | **ALREADY_CREDITED** |
| `2111151951` | NGN 1,000 | **ALREADY_CREDITED** |
| `2112136892` | NGN 1,500 | **ALREADY_CREDITED** |

Total wallet value posted: **NGN 2,700**. Each has a matching paid payment intent, posted wallet transaction, and wallet ledger entry. No duplicate transaction/reference use was found. The historical `paymentEvent` documents are absent, and the wallet transaction `providerTransactionId` fields are null; canonical document IDs and references identify the transactions. These are audit/observability gaps, not missing credits. Do not credit these transactions again or rewrite historical wallet rows. Gateway/customer fees are excluded from wallet value.

This run used the approved viewer ADC directly; it did not use a JSON key or the production application service account. The repeatable key-based procedure below remains available for a future audit.

1. Record the exact Social Booster project ID independently.
2. Create or select a dedicated audit principal with only **Cloud Datastore Viewer** and create a short-lived JSON key outside the repository.
3. Run:

   `npm run audit:flutterwave:readonly -- --service-account C:\secure\viewer.json --project-id exact-project-id`

4. Confirm `readOnly: true`, the project ID, all three provider IDs and references. The script uses five exact document reads per payment, one exact wallet read per discovered owner, and three bounded queries capped at 10, 10 and 25 documents. It contains no write calls.
5. Treat `CREDIT MISSING — VERIFIED` or `DUPLICATE CREDIT — VERIFIED` as an incident finding only. A second reviewer must validate the provider evidence and sanitized export before any separately approved correction.
6. Revoke the key and remove the local key file after retaining the sanitized evidence in the access-controlled incident record.

The exact documents are `paymentIntents/{txRef}`, `walletTransactions/flutterwave:{transactionId}`, `walletLedger/flutterwave:{transactionId}`, `paymentEvents/flutterwave:{transactionId}`, `paymentEvents/flutterwave-callback:{transactionId}`, and `wallets/{intent.userId}`. No production record may be edited from this procedure.
