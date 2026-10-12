# Build status — Blog Automation Studio 3.0

_Last updated: 2026-10-12 (session 1)_

## Verified in this environment
| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` (unit 20, integration 14) | pass |
| `npm run build` | pass |
| `npm run dev:all` | web + worker start; worker acquires lock; first-run admin, task creation via API, CSRF rejection, all dashboard pages return 200 (HTTP smoke test) |

## Milestones
| # | Scope | State |
|---|---|---|
| M1 | Scaffold, setup script, first-run admin, auth/roles, CSRF, layout, settings, logs | **Done** |
| M2 | Durable queue, single-worker lock, leases, lease recovery, retry/backoff, stage orchestration | **Done** (unit-tested) |
| M3 | Websites CRUD, per-site Playwright profile, manual login, session test, editor detection, category + internal-link sync | **Code done, not live-verified** (no WordPress site available) |
| M4 | MV3 extension, pairing key, agent protocol, tab ownership, 429 backoff, login/human-check pause, conversation recovery | **Done against fake ChatGPT fixture**; not verified against real chatgpt.com (selectors may need adjustment) |
| M5 | Writer manifests, Prompt Manager (exact text preserved, history, restore default), Celebrity 1.0/2.0 & Tigram pipelines, parsers, assembly, SEO/quality checks, task detail UI | **Done**; full Celebrity 1.0 article assembled end-to-end with simulated answers |
| M6 | Draft-only WordPress adapter via REST nonce from the logged-in admin page, idempotent create/reconcile, Rank Math meta when REST-writable, publication guard | **Code done, guard unit-tested; adapter not live-verified** |
| M7–M16 | Image Studio, humanizer, campaigns/import/router, duplicate review, research evidence, scheduler/publishing flow, Search Console, refresh, analytics/throughput, website control center | **Not started** (stages for images/humanizer are explicit skips with a review reason) |

## Not claimed
- No live ChatGPT, WordPress, Rank Math, or Search Console run has been performed.
- Rank Math score is shown only if read from WordPress (currently never) — the app's own score is labelled as a local heuristic.
- The **6 verified drafts/hour** target is **unverified**; it requires a real, owner-authorized two-hour benchmark.

## Known gaps / next steps
1. Live verification on a real WordPress (Gutenberg + Classic, EN/DE) and real ChatGPT; tune selectors in `src/wordpress/selectors.ts` and `extension/content.js`.
2. Rank Math panel score reading (Playwright) and SEO-correction loop.
3. M7+ features listed above.
