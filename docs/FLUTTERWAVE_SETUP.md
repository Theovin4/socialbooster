# Flutterwave setup

In Flutterwave Dashboard → Settings → API, copy the public and secret keys. In Settings → Webhooks, set the secret hash and endpoint to `https://socialbooster.vercel.app/api/webhooks/flutterwave`. Add all three values to Vercel Production. Verify a live transaction server-side before calling the idempotent wallet function. The browser redirect is never proof of payment. Test valid, invalid, repeated and reversed events before launch.
