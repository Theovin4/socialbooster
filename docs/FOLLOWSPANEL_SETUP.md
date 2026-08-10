# FollowsPanel provider setup

Obtain the API key from the FollowsPanel account API page. Add it to Vercel as `FOLLOWSPANEL_API_KEY`; keep `FOLLOWSPANEL_API_URL=https://followspanel.com/api/v2`. Both are server-only.

Call the protected service-sync cron once and confirm the returned count plus `provider_services` rows. The storefront reads these local records, not the provider on every request. Test `balance`, one low-value permitted order, status, then refill/cancel only on services advertising support. Read operations retry with backoff; order/refill/cancel submissions do not retry automatically. Request idempotency is enforced locally before provider submission.
