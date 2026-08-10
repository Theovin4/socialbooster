# PayPal setup

In PayPal Developer Dashboard → Apps & Credentials, create a Live REST app and copy client ID/secret. Add webhook `https://socialbooster.vercel.app/api/webhooks/paypal`, subscribe to completed, denied, refunded and reversed payment events, and store its webhook ID. Set `PAYPAL_ENVIRONMENT=live`. The current endpoint deliberately returns 503 until PayPal transmission-signature verification and capture lookup are activated and tested.
