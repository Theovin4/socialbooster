# Social Booster emergency Vercel CPU remediation

Date: 3 November 2026 (Africa/Lagos)
State: local working tree only; not committed, pushed, deployed or configured in production

## A. CPU root causes and evidence

### Confirmed production evidence

- Owner-supplied Vercel usage records Social Booster at **8h 10m Active CPU**, 68.4% of the team's 11h 57m, against a 4h team allowance. The team was paused on 2 November 2026.
- The Vercel runtime-error aggregate contains **six 60-second timeouts** on `/api/cron/services`, first seen 21 September and most recently 1 November 2026. The latest occurrence belongs to production deployment `dpl_Fovf5VvhtSYZkHunhHzwjKxkhpbw`.
- The live catalogue exposed by the indexed `/services` response contains **7,177 public services**.
- The repository contains 31 route handlers and 52 page routes. Private dashboard, admin and finance routes correctly remain dynamic and uncached.
- Observability Plus and Vercel Web Analytics are not enabled. Hobby raw-runtime-log retention is approximately one hour, and the team is paused. Historical route-level Active CPU, cache-result and request-volume breakdowns are therefore unavailable.

### High-confidence code findings

1. Every first request to `/services/[id]` rebuilt, sanitized, deduplicated and sorted the complete catalogue before finding one service. A crawler warming 7,177 detail URLs could drive roughly 51.5 million ID comparisons per deployment, excluding transformation work.
2. `/services/[id]`, `/pricing`, the service-detail JSON endpoint and all custom sitemap route handlers were explicitly or implicitly function-rendered even though their output is public and non-sensitive.
3. `/services` is query-driven and remains dynamically rendered, but previously had no CDN-specific page cache instruction.
4. An unchanged provider catalogue still ran every service through CPU-heavy quality evaluation and then traversed the result repeatedly to create summary counts.
5. `/api/cron/services` had a hard 60-second limit despite bounded upstream retries that can legitimately exceed that wall-clock duration. A timeout discarded the useful run and forced a later full retry.

## B. Highest-cost routes and functions

| Priority | Route/function | Classification | Evidence |
| --- | --- | --- | --- |
| 1 | `/services/[id]` | High-confidence CPU amplifier | 7,177 variants; full-catalogue reconstruction for one item before remediation |
| 2 | `/api/cron/services` | Confirmed production failure and CPU source | Six retained 60-second timeout errors |
| 3 | `/services` | High-confidence traffic amplifier | Public dynamic SSR with search/pagination and duplicated desktop/mobile catalogue markup |
| 4 | `/sitemap-services.xml` | Medium-confidence crawler amplifier | Full catalogue transformation behind a dynamic route |
| 5 | `/pricing` | Medium-confidence repeated SSR | Public catalogue-derived page previously forced dynamic |
| 6 | `/api/public/services` | Medium-confidence query-cardinality risk | Public search endpoint; each novel query can require a catalogue filter |
| 7 | `/api/cron/orders` and `/api/cron/activations` | Bounded, unconfirmed | Loops and batches are bounded; no retained timeout cluster was found |

Payment verification, wallet finalization, refunds, provider order submission and authenticated customer/admin pages were not identified as proven CPU drivers and were not cached or disabled.

## C. Exact local changes

- `/services/[id]` now uses on-demand ISR and a cached, public-safe two-document lookup instead of reconstructing all 7,177 services.
- The service-detail JSON endpoint uses the same bounded lookup and native static-response revalidation.
- `/pricing` is an hourly ISR page.
- `/services` receives a Vercel-only five-minute CDN cache with one-hour stale-while-revalidate. Query variants remain separate; no private route receives this header.
- `/api/public/services` increased its public CDN TTL from one to five minutes and rejects extra/repeated parameters, searches over 80 characters and searches over eight terms before any catalogue work.
- Provider detail updates invalidate both the detail JSON cache and the matching public service-page cache; catalogue changes invalidate all cached service pages.
- Page, guide, platform and Africa sitemap handlers plus `llms.txt` are static. The service sitemap is generated at runtime from the public catalogue snapshot, cached for one hour, and invalidated with catalogue changes; this prevents a build without production catalogue access from publishing a permanently empty sitemap.
- Unchanged provider catalogues short-circuit before quality evaluation. Changed catalogues build quality counts in one pass rather than repeated full-array filters.
- Provider catalogue processing fails closed above 20,000 validated rows.
- The catalogue cron ceiling is 300 seconds; every provider request, retry count and batch remains independently bounded.
- All three cron routes record wall time and process CPU time so future logs can distinguish provider wait time from application parsing work.

No payment, wallet, refund, order-submission, pricing formula, authentication, webhook or shared-gateway behavior was changed.

## D. Estimated CPU savings and assumptions

- A synthetic 7,177-service lookup benchmark completed the prior repeated linear scans in 1,664.91 ms versus 1.97 ms for direct lookups across the same set: **99.88% less lookup-loop CPU**. Firestore/network wait is excluded from Vercel Active CPU and is not represented in that benchmark.
- A 500-iteration synthetic summary benchmark reduced repeated catalogue-summary loop time from 1,283.63 ms to 1,146.63 ms: **10.7% less loop CPU** for changed catalogues. Unchanged catalogues now skip quality evaluation entirely, so their expected reduction is materially larger.
- Warm service-detail, pricing, sitemap and repeated `/services` requests should avoid function execution through ISR/CDN hits. The service sitemap's one-hour data cache uses the bounded public catalogue snapshot rather than scanning the services collection.
- The overall **80% target is plausible only if public catalogue rendering and crawler traffic caused most of the reported usage**. That is a high-confidence hypothesis, not a measured guarantee, because historical function metrics are unavailable.

## E. Firebase impact

- A cold service-detail ID now performs one bounded `publicServiceDetails` lookup and one exact `services` document read. The result is cached for five minutes and the HTML/JSON response is cached separately.
- A hypothetical first-time warmup of all 7,177 service IDs is bounded to approximately 14,354 Firestore document reads. Repeated warm requests use zero Firestore reads.
- Catalogue listing still uses immutable chunk caches and zero warm Firestore reads.
- No new Firestore writes, scans, listeners, pageview logging or financial-document access were introduced.
- Unchanged provider synchronization retains its existing bounded reads/writes and no longer republishes or invalidates the catalogue.

## F. Tests and build

Validation on 3 November 2026:

- Focused catalogue/cache/timing tests: 3 files / 22 tests passed.
- Full regression: 47 files / 278 tests passed, including Firebase Rules 3/3.
- TypeScript and ESLint passed.
- The original production build passed with the local production-Firestore guard enabled and made no production Firestore read or write. The service sitemap was then statically generated without the production catalogue and its error fallback emitted an empty sitemap. The follow-up repair makes this data-dependent route runtime-only, removes the success-shaped empty fallback, and uses the tagged one-hour catalogue cache plus bounded CDN caching. Build-time production Firestore access remains unnecessary.
- `npm audit --omit=dev` reports six moderate upstream Google/Firestore dependency findings, zero high and zero critical; no dependency change was made during this CPU review.
- `git diff --check` passed. No dedicated Social Booster secret-scan script was found; no credential values were read or added.

These are local validation results only. They do not establish deployment eligibility or measured production CPU reduction.

## G. Remaining bottlenecks

- `/services` still needs a function for a cold query variant; the CDN prevents repeated identical work but cannot stop high-cardinality abusive queries by itself.
- The provider APIs return full catalogues. Even unchanged synchronization must download, parse, normalize and fingerprint the rows once per provider.
- `/api/v2` service-list responses intentionally return the complete catalogue to authenticated reseller clients and cannot be safely page-cached as a POST response.
- A new deployment starts with a cold ISR/data cache. Avoid unnecessary production deployments because each one requires catalogue cache warmup.
- Route-level CPU attribution, cache-hit ratios and bot categories remain unavailable without Observability Plus or exported logs.

## H. Deployment and rollback plan

1. Owner reviews this uncommitted diff and validation evidence.
2. If separately approved, deploy through the existing Vercel project without changing payment/provider configuration.
3. Smoke-test public static/ISR routes, authentication, wallet, order and admin routes without financial transactions.
4. Confirm `x-vercel-cache` transitions to `HIT`, `STALE` or `PRERENDER` for public routes while private routes remain `BYPASS`/private.
5. Observe cron timing logs for at least seven days and compare Social Booster Active CPU with an equivalent pre-change window.

Rollback is a normal code rollback to the prior deployment. It does not require any database rollback because this pass adds no schema migration, production mutation or environment change.

## I. Monitoring recommendations

- Track Active CPU by route, invocation count, duration, cache result/reason and bot category.
- Alert when `/api/cron/services` fails, exceeds 240 seconds wall time or has a sustained CPU-to-wall ratio above 0.5.
- Record provider row counts, short-circuit state, quality-evaluation time and changed-service count per sync.
- Track CDN/ISR hit ratios for `/services`, `/services/[id]`, `/pricing`, `/sitemap-services.xml` and the public service-detail endpoint.
- Review high-cardinality search requests. If abuse is confirmed, add a narrowly scoped Vercel Firewall rate limit in a separately approved production configuration change.

## J. Hosting-plan suitability

The application can fit a low-cost Vercel plan when public catalogue traffic is predominantly served from CDN/ISR and background jobs remain bounded. A 7,177-item live catalogue with three upstream providers is near the practical edge of a Hobby plan, particularly after deployments or under broad crawler traffic. The architecture is suitable for the current plan only if post-release measurements show the expected cache-hit rate and Active CPU falls below the allowance. If it remains above four hours, the next safe choices are a plan with adequate compute/observability or moving catalogue synchronization to a separately monitored scheduled worker; neither change is part of this local pass.

## Review status

**STOPPED FOR OWNER REVIEW — NOT DEPLOYED**
