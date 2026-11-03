# Vercel Active CPU emergency recovery — 3 November 2026

## A. Executive summary

The supplied Vercel usage report shows 11h57m of Active CPU against a 4h allowance. Social Booster is the largest reported project at 8h10m (68.4%). The largest evidence-supported application-level CPU concern is Social Booster's public service catalogue/detail rendering and its daily catalogue synchronization; route-level CPU attribution is unavailable, so these are code-level amplifiers, not proven shares of the account total.

The canonical Social Booster checkout already contains uncommitted local CPU-remediation work. During review, a stale service-page cache invalidation gap was found and fixed by tagging each public service page and invalidating that tag when its provider details change. The existing synthetic benchmarks remain non-production evidence; no production CPU reduction is established.

The last observed READY Social Booster production deployment is commit `f1bb1369cb88c6c36bd86ac980f52e8c1ced79fe`, not the pushed payment-remediation commit `7746b084d539a83d67f8ca9428d83698d9fcfa2e`. A prior deployment attempt for the payment commit was rejected with “Your Team exceeded our fair use limits and has been blocked.” No deployment was retried. Restoring deployment eligibility requires an owner/Vercel action; code changes alone cannot unpause the team.

## B. Scope and safety

- Read-only local Git, Vercel project/deployment metadata, environment-variable names, configuration, and source inspection only.
- Environment-variable values and credentials were not read.
- No production database, payment, wallet, order, refund, billing, environment, domain, or project mutation was performed.
- No file was changed before this inventory was completed. This report is the first audit-created file.
- No commit, push, deployment, plan change, project deletion, gateway change, or production smoke test was performed.

## C. Repository inventory and preservation

| Site | Local source | Git/release state | Existing local work |
|---|---|---|---|
| Social Booster | `C:\Users\USER\Documents\Codex\2026-10-13\act-as-a-senior-software-engineer\work\socialbooster` | `Theovin4/socialbooster`, `main` at `7746b084...`; local `origin/main` matches | Uncommitted CPU work preserved. |
| Century Blog | `C:\Users\USER\Documents\century-blog` (`century_blog_site` is the Vercel root) | `Theovin4/century-blog`, `main` at `adafb81d...` | `data/posts.json` modified; editorial worktree is nine commits ahead of `origin/main`. |
| Fly Logistics | `C:\Users\USER\Documents\New project\fly-logistics` | `Theovin4/flylogistics`, `main` at `e9ffcdee...` | Nine modified tracked paths and 48 untracked paths; includes unrelated and shared-gateway work. Preserved; gateway remains off. |
| Peaceful Taste | `C:\Users\USER\Documents\New project\peaceful-taste-web` | `Theovin4/peaceful-taste-web`, `main` at `5f249fe9...` | Extensive modified, deleted, and untracked work. Preserved. |
| Apply | `C:\Users\USER\Documents\New project\Apply` | Not a standalone Git repository; parent `New project` has no configured remote | Extensive parent-workspace changes. No clean deployable Git baseline was established. |

Other local repositories were inventoried. No additional candidate production repository for these five sites was established. In particular, do not treat the duplicate Social Booster checkout, stale Fly handoff, or Apply's parent workspace as a clean release tree. No local changes were discarded or transferred.

## D. Supplied usage figures and interpretation

| Project | Supplied Active CPU | Supplied share |
|---|---:|---:|
| Social Booster | 8h10m | 68.4% |
| Century Blog | 2h30m | 21.0% |
| Fly Logistics | 50m43s | 7.1% |
| Apply | 17m08s | 2.4% |

The figures are owner-supplied dashboard values, not independently exported route metrics. A Peaceful Taste project-level CPU value was not supplied. The reported team total is 11h57m versus a 4h allowance.

Other supplied counters: 17,444,899 Data Cache reads, 97,404 function invocations, 152,265 CDN requests, 39.4/360 GB-hours provisioned memory, and 48/100 build hours. These counters have different units. Cache reads are not HTTP requests, database reads, function invocations, or CPU time; they cannot establish CPU causality.

## E. Vercel project and latest production inventory

| Site/project | Project ID | Production domain | Vercel root | Latest observed production deployment |
|---|---|---|---|---|
| Social Booster / `socialbooster` | `prj_5oXhNKTwO6E4Y8bSYtYK0v6OclEm` | `www.socialbooster.net.ng` | `.` | READY, `f1bb1369cb88c6c36bd86ac980f52e8c1ced79fe` |
| Century Blog / `centuryblogg` | `prj_mMurwCKNBIhl1rdW4EOmiZBgcQB4` | `www.centuryblog.com.ng` | `century_blog_site` | READY, `adafb81d73e49a78a15ab2caf542de03c3b6b7c6` |
| Fly Logistics / `flylogistics` | `prj_3Fd9oQ9QzaIJ4C72ESzrK58KAwaU` | `flylogistics.com.ng` | `.` | READY, `e9ffcdee7c146144eeefaf9facd51ed2683b2670` |
| Peaceful Taste / `peacefultaste` | `prj_KWmi6C2zWtkkXGI06bup4PQVoqAr` | `peacefultaste.vercel.app` | `.` | READY, `5f249fe905f20bde8a3ad09cfb311f178eb22230` |
| Apply / `apply` | `prj_2lUpJIoAV3WdGmb7ODOoiMdudJyJ` | `apply-kappa-pearl.vercel.app` | `.` | READY; deployment metadata did not expose a Git commit or repository |

The five listed projects were configured for Node `24.x`. Century Blog uses Next.js 16; Social Booster and Fly Logistics use Next.js; Peaceful Taste uses a Vite/Express Vercel build; Apply is a static site with Vercel API functions. Project inventory also contains a second Century-named project and multiple Fly-named projects. They are possible duplicate/orphan projects; their ownership, traffic, and alias use were not proven. Do not delete, move, or reconfigure them based on names alone.

Vercel production environment-variable names were inspected for the five projects; values were not requested or revealed. `FLUTTERWAVE_GATEWAY_MODE` was not present in the Social Booster production variable-name listing. Shared-gateway mode must remain off; no gateway setting was changed.

## F. Social Booster — evidence-ranked CPU findings

### CONFIRMED production observations

- Owner-supplied account usage assigns Social Booster 8h10m / 68.4% of team Active CPU.
- Retained runtime-error evidence in the existing handoff records six 60-second timeouts on `/api/cron/services`, most recently 1 November 2026.
- The public catalogue contained 7,177 services in the existing handoff's recorded observation.
- Historical per-route Active CPU, cache-hit ratio, request/bot mix, and attribution to the team total were unavailable.

### PROBABLE code-level CPU amplifiers (not measured contributors)

- The previous `/services/[id]` path rebuilt/transformed the full service catalogue to resolve one item. The local candidate replaces this with a cached, bounded lookup.
- Public service, pricing, detail JSON, and sitemap output can invoke server rendering when uncached; local changes propose ISR/static delivery and a CDN cache for the public catalogue.
- Unchanged provider catalogues still require provider download, parse, normalize, and fingerprint work; local changes propose bypassing later quality evaluation/publication when hashes match.
- Public query variants can still invoke catalogue filtering on a cold/high-cardinality request.

### POSSIBLE / NOT SUPPORTED BY EVIDENCE

- Crawlers, high-cardinality searches, repeated cron retries, or cache misses may amplify work, but no route-level telemetry proves any of them caused the reported total.
- The 300-second catalogue-cron ceiling may avoid discarding a long provider run, but it can also permit more CPU per invocation. Its net effect on Active CPU is unmeasured; timeout reduction must not be presented as CPU reduction.
- Other payment, wallet, refund, order, finance, and admin routes are not identified as CPU causes by available evidence. Keep private/financial routes uncached.

Existing local proposals are summarized in `docs/VERCEL_CPU_REMEDIATION.md`. Its synthetic lookup/summary benchmarks are not production measurements; the 80% overall reduction remains a hypothesis, not a result.

## G. Other project-level observations

| Site | Source-level evidence | Classification |
|---|---|---|
| Century Blog | Public home/blog/category/news pages use ISR (120–900 seconds); post summaries use a 120-second cache; the dashboard is dynamic. Daily automation runs at 07:00 UTC, selects at most one post, fetches provider/news material, and may perform AI rewriting. | Public rendering is already cached. Scheduled AI/news work is a **possible** CPU source, but actual CPU versus external wait is **NOT AVAILABLE**. |
| Fly Logistics | Public blog pages use revalidation. Daily blog publishing runs at 00:00 UTC with a 300-second ceiling. Background jobs run at 01:30 UTC, claim at most eight jobs, and process those jobs sequentially; route ceiling is 60 seconds. | Job count is bounded; 300-second blog allowance is a possible upper-bound concern, not proof of CPU contribution. |
| Apply | Public page handlers set CDN caching in the inspected paths. Jobs ingestion runs at 03:00 UTC; drafts/authority content runs at 05:00 UTC. Ingestion merges/limits published results to 500; authority generation bounds batch and content sizes. | Scheduled external API/AI work is a **possible** source; no project CPU attribution is available. The project is not connected to an established local Git remote. |
| Peaceful Taste | Static Vite output and site-level HTML caching are configured; API paths are private/no-store. Daily blog function runs at 07:00 UTC with a 60-second ceiling; general API function ceiling is 30 seconds. | No project-specific CPU share or route metrics were supplied. No CPU cause is confirmed. |

## H. Scheduled work and potential concurrency

Observed schedules (UTC):

- Social Booster: services 23:00, orders 03:30, activations 05:00.
- Century Blog: automation 07:00.
- Fly Logistics: blog 00:00, background jobs 01:30.
- Apply: jobs 03:00, drafts 05:00.
- Peaceful Taste: daily blog 07:00.

Social activations and Apply drafts coincide at 05:00; Century Blog and Peaceful Taste automation coincide at 07:00. This is a possible team-level burst, not a proven contention or CPU cause. No schedule was changed. Do not disable payment/order/refund safety jobs without owner approval and service-impact analysis.

## I. Cache and runtime interpretation

Static/ISR/CDN delivery can reduce function execution for repeat public requests, but cold builds, cache invalidations, query variants, and revalidation still incur work. Data Cache read volume alone does not demonstrate a cache inefficiency or CPU issue. No realtime listeners, polling loops, Firebase Storage dependency, Cloud Functions dependency, or Blaze-only dependency were added during this audit.

## J. Runtime, project links, and gateway

The five inspected Vercel projects report Node `24.x`. The current Social Booster local package also targets Node 24. Project Git metadata links Social Booster, Century Blog, Fly Logistics, and Peaceful Taste to their corresponding `Theovin4` repositories. Apply deployment metadata has no Git source; its canonical remote/release branch remains **NOT VERIFIED**.

Shared Flutterwave gateway mode remains off. No independent gateway production architecture or configuration was touched.

## K. Vercel restriction and required owner action

A prior Vercel deployment attempt was explicitly rejected: “Your Team exceeded our fair use limits and has been blocked.” The project inventory and older READY deployment records do not establish that the current team restriction has been lifted. No retry or live deployment eligibility test was made.

Owner action required: use the Vercel team dashboard/support channel to confirm the exact restriction, remaining allowance/reset time, current deployment eligibility, and any required billing/account review. Do not assume code changes or a plan upgrade automatically remove a fair-use block. No account or billing change was made.

## L. Existing local remediation — review gate

The Social Booster checkout contains uncommitted catalogue/cache/cron/timing changes. The exact diff was reviewed without regenerating or discarding it. A public-service page cache tag was added to the existing CPU candidate and is invalidated alongside the detail JSON cache. Focused tests passed (3 files / 22 tests); full regression passed (47 files / 278 tests, including Firebase Rules 3/3); TypeScript, ESLint, and `git diff --check` passed. The production build passed with the repository guard blocking production Firestore access; its static service sitemap therefore did not validate production catalogue content. `npm audit --omit=dev` remains at six moderate upstream Google/Firestore findings, zero high, zero critical. No dedicated repository secret-scan script was found; no credential values were read or added. No production CPU reduction is measured.

Any CPU claim must distinguish wall-clock waiting from process CPU. The local timing helper can provide future logs, but it cannot reconstruct prior route attribution or prove an account-level reduction.

## M. Change and production safety status

One tightly scoped cache-invalidation fix and its regression test were added to the existing uncommitted Social Booster CPU candidate, along with this report update. No files in the other repositories were changed. No staging, commit, push, deploy, production data/config/billing mutation, real payment, or smoke test occurred. Existing dirty work remains preserved. Historical payments remain already credited; additional credit remains NGN 0. No production Firestore mutation was performed.

## N. Hosting and cost options

1. Retain the current plan only if subsequent measured usage stays within its allowance and Vercel restores deployment eligibility.
2. Ask Vercel to quote/confirm the currently available paid team plan and included/overage compute before deciding; current account-specific pricing and fair-use treatment are **NOT VERIFIED** here.
3. If recurring scheduled AI/catalogue work remains expensive after measurement, evaluate a separately monitored worker/cron host. Estimate worker, storage, network, and operations cost before migrating; do not move payment finalization or change data ownership as part of this CPU investigation.

No hosting plan, provider, or account billing was changed.

## O. Monitoring needed to prove impact

After an owner-approved deployment and restored eligibility, compare equivalent pre/post windows for per-project Active CPU, route/function execution counts, duration, CPU time, cache result, cold/warm status, cron duration/result, and bot/query class. Record provider row counts and changed/unchanged sync outcomes. Use Vercel-supported metrics/log retention or a separately approved observability plan. Do not infer savings from synthetic benchmarks, CDN request totals, Data Cache units, or wall duration alone.

## P. Financial and shared-service guardrails

- Wallet funding remains a liability movement, not revenue.
- Historical transactions `2111150666`, `2111151951`, and `2112136892` remain `ALREADY_CREDITED`; no re-credit is authorized.
- Payment finalization, callback/webhook recovery, refunds, order submission, finance rollups, and provider confirmation recovery must not be weakened or cached.
- Shared-gateway production mode remains off. Do not enable `shadow` or `enforce`.

## Q. Unavailable or unverified evidence

- Per-route/per-project Vercel Active CPU breakdown and cache-hit ratios: **NOT AVAILABLE**.
- Peaceful Taste CPU share in the supplied report: **NOT PROVIDED**.
- Current fair-use restriction status and exact restoration requirements: **NOT VERIFIED** after the prior explicit rejection.
- Apply's canonical Git repository/remote and production source commit: **NOT VERIFIED**.
- Ownership/traffic/alias usage for duplicate Century/Fly-named Vercel projects: **NOT VERIFIED**.
- Production runtime behavior after the pushed payment-remediation commit: **NOT VERIFIED**; current observed Social Booster READY deployment is older.
- Any production CPU savings from uncommitted changes: **NOT MEASURED**.

## R. Owner decision and safe next actions

1. Review and approve the preserved Social Booster CPU diff and its regression evidence.
2. Confirm Vercel team restriction status and plan/cost options manually.
3. Reconcile duplicate project ownership/traffic before any project or domain cleanup.
4. Establish Apply's canonical source repository and release procedure.
5. Only after approvals, test and deploy through the existing projects; verify shared gateway remains off. Do not commit, push, deploy, or change account settings as part of this audit without separate approval.

## S. Completion gate

The inventory and evidence-ranked audit are recorded. The current restriction prevents treating the pushed payment remediation or local CPU candidate as production-verified. Final recovery approval requires owner review, validation of existing local changes, confirmed Vercel deployment eligibility, and measured post-deployment results. No CPU-reduction percentage is guaranteed.
