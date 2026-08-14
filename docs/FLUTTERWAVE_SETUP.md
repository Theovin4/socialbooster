# Flutterwave setup

Use Test Mode first. In Flutterwave Dashboard → Settings → API, copy the test secret key. In Settings → Webhooks, create a secret hash and add `https://socialbooster-sigma.vercel.app/api/webhooks/flutterwave`. Add `FLUTTERWAVE_SECRET_KEY` and `FLUTTERWAVE_WEBHOOK_SECRET_HASH` to Vercel. The hosted checkout implementation does not use the public key. Keep `PAYMENTS_ENABLED=false` until sandbox tests pass. The server verifies the raw-body HMAC and then verifies status, amount, currency and reference directly with Flutterwave before an idempotent wallet credit.
