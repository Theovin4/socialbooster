# Production launch checklist

- [ ] Supabase project, migration, RLS and database advisors verified
- [ ] All Production environment variables configured; no secrets exposed
- [ ] First admin elevated database-side and MFA enforced operationally
- [ ] Provider sync, balance, status and one permitted low-value order tested
- [ ] Flutterwave live verification/webhook tests complete
- [ ] PayPal signature verification implemented and live webhook tests complete
- [ ] Resend domain authenticated; confirmation/reset/security emails tested
- [ ] Turnstile connected to registration, reset, contact and abuse thresholds
- [ ] Security headers, rate limits, audit logs and cron authorization tested
- [ ] GA4/Search Console/sitemap/robots configured without sensitive data
- [ ] Sentry configured with PII scrubbing; database backups/PITR selected
- [ ] Mobile, accessibility, performance and route smoke tests pass
- [ ] Wallet concurrency, duplicate event/order and refund scenarios pass
- [ ] Rollback owner, previous deployment and database rollback plan documented

Do not launch payments until the PayPal handler, Turnstile, rate-limit persistence, order orchestration, and payment verification are fully activated and integration-tested.
