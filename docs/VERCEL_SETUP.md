# Vercel setup

Open **Vercel → Social Booster project → Settings → Environment Variables → Add key → Add value → select environments → Save → redeploy**. Never paste secrets into source control.

| Variable | Visibility | Source / dashboard path | Example | Prod | Preview | Dev | Redeploy |
|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Public | Vercel deployment/domain | `https://socialbooster.vercel.app` | yes | per URL | localhost | yes |
| `AUTH_SECRET` | Secret | Generate 32+ random bytes | `[random]` | yes | yes | yes | yes |
| `CRON_SECRET` | Secret | Generate 32+ random bytes | `[random]` | yes | optional | yes | yes |
| `DEFAULT_GROSS_MARGIN` | Server config | Business config | `0.40` | yes | yes | yes | yes |
| Supabase variables | URL/key | Supabase → Project Settings → API Keys | `https://…supabase.co` / `sb_…` | yes | yes | yes | yes |
| FollowsPanel variables | Secret API credential | FollowsPanel account → API | URL plus `[key]` | yes | optional | optional | yes |
| Resend variables | Secret/sender | Resend → API Keys / Domains | `[key]`, `support@example.com` | yes | optional | optional | yes |
| Turnstile variables | Public site key + secret | Cloudflare → Turnstile → widget | `0x…` | yes | yes | yes | yes |
| Flutterwave variables | Public + secrets | Flutterwave → Settings → API / Webhooks | `FLWPUBK-…` | yes | test keys | test keys | yes |
| PayPal variables | Secrets | PayPal Developer → Apps & Credentials / Webhooks | `[client id]` | yes | sandbox | sandbox | yes |
| `EXCHANGE_RATE_API_KEY` | Secret | Chosen rate provider dashboard | `[key]` | when enabled | optional | optional | yes |
| Analytics/Sentry variables | Mixed | GA4, Meta, Sentry project settings | provider IDs | optional | optional | optional | yes |

Use the exact names in `.env.example`. Configure Vercel Cron to GET `/api/cron/services` with `Authorization: Bearer $CRON_SECRET`; add a second incomplete-order sync schedule after provider credentials pass the smoke test.
