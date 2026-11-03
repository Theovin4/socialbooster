# Temporarily accepted upstream dependency risk

Review date: 3 November 2026
Review after: 1 February 2027
Status: Temporarily accepted upstream moderate dependency risk

## Decision

The production dependency audit reports six moderate findings and no high or
critical findings. The findings remain transitive in the current supported
Firebase Admin / Firestore tree after a normal npm refresh. This is a
time-bounded acceptance under the release criteria for the payment remediation;
it is not an audit suppression or a claim that the advisories are false
positives.

The supported refresh kept `firebase-admin@14.5.0` and resolved
`@google-cloud/firestore@9.4.0`. Firestore 9.4.0 declares
`@google-cloud/firestore-api@^0.2.0`, which resolves to 0.2.0. The separately
published 0.7.1 release is outside that declared range. Firestore API 0.2.0
declares `google-gax@^5.0.0`, and its nested authentication chain resolves the
remaining vulnerable versions. No package overrides, forced updates, or direct
pins of Google internals were used.

The local package engine is `24.x`; the linked production Vercel project is
also configured for Node `24.x`. This satisfies the `>=22` engine requirement
of Firebase Admin 14.5.0 and Firestore 9.4.0.

## Findings

| Affected package | Installed version | Severity | Advisory | Dependency path |
| --- | --- | --- | --- | --- |
| `glob` | 10.5.0 | Moderate | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4): AbortSignal cancellation bypass can allow post-timeout filesystem traversal | `firebase-admin@14.5.0` → `@google-cloud/firestore@9.4.0` → `@google-cloud/firestore-api@0.2.0` → `google-gax@5.0.8` / `google-auth-library@10.5.0` → `gcp-metadata@8.1.4` → `gaxios@7.1.3` → `rimraf@5.0.10` → `glob@10.5.0` |
| `minimatch` | 9.0.9 | Moderate | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): potential denial of service through globparts amplification | Same Firestore API → `google-gax` → auth → `gaxios` → `rimraf` → `glob@10.5.0` → `minimatch@9.0.9` chain |
| `rimraf` | 5.0.10 | Moderate, inherited | The affected `glob` advisory above | `gaxios@7.1.3` and `google-gax@5.0.8` → `rimraf@5.0.10` → `glob@10.5.0` |
| `gaxios` | 7.1.3 (nested) | Moderate, inherited | The affected `glob` advisory above | `gcp-metadata@8.1.4` → exact `gaxios@7.1.3` → `rimraf@5.0.10` |
| `gcp-metadata` | 8.1.4 (nested) | Moderate, inherited | The affected `glob` advisory above | `google-auth-library@10.5.0` → `gcp-metadata@8.1.4` → `gaxios@7.1.3` |
| `google-gax` | 5.0.8 (nested) | Moderate, inherited | The affected `glob` advisory above | `@google-cloud/firestore-api@0.2.0` → `google-gax@5.0.8` → `rimraf@5.0.10` |

`npm audit --omit=dev` reports `fixAvailable: true`, but its proposed tree
requires versions outside the current parents' declared ranges: glob 14 and
minimatch 11 are outside glob 10's/rimraf 5's ranges; rimraf 6 is outside
parents' `^5` ranges; and google-gax 6 is outside Firestore API 0.2.0's
`^5.0.0` range. The nested metadata package pins gaxios 7.1.3. Updating the
supported parents to their current compatible releases did not remove the
nested chain. No compatible upstream fix for this declared tree was established
at review time.

## Mitigation and monitoring

- The application has no direct imports of `@google-cloud/firestore-api`,
  `google-gax`, `gaxios`, `gcp-metadata`, `glob`, `minimatch`, or `rimraf` in
  `src` or `scripts`; the dependencies are present through Firebase Admin.
- No application call site passes user-controlled glob patterns to these
  utility packages. This is a mitigation, not a claim that every transitive
  code path is unreachable.
- Keep Firebase Admin and Firestore at their current supported releases and do
  not force internal package versions with overrides.
- Continue reporting npm audit output without suppressions. Revisit this
  acceptance when any upstream dependency in the path updates its declared
  range or a patched compatible release becomes available.

Monitor: `firebase-admin`, `@google-cloud/firestore`,
`@google-cloud/firestore-api`, `google-gax`, `google-auth-library`,
`gcp-metadata`, `gaxios`, `rimraf`, `glob`, and `minimatch`.

At the review-after date, rerun the production audit and dependency-path
inspection. Remove this acceptance once the supported tree no longer contains
the affected versions; otherwise renew or reject it based on current upstream
evidence.
