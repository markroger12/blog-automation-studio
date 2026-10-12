# Blog Automation Studio 3.0

Private, self-hosted dashboard that turns keywords into reviewed **WordPress drafts** for English and German sites, using **your own signed-in ChatGPT tab** (via a Chrome extension) and **your own signed-in WordPress sessions** (via persistent Playwright profiles). No OpenAI API, no stored WordPress passwords, no auto-publishing.

## Requirements (Windows first)
- Windows 10/11, Node.js **20.9+**, Google Chrome, ~2 GB free disk.

## Install
```powershell
git clone <this repo> blog-automation-studio
cd blog-automation-studio
npm install
npm run setup        # creates .env with a random secret, data/ folders, applies migrations, seeds settings & prompts
npm run dev:all      # dashboard (http://localhost:3000) + worker
```
Open http://localhost:3000 and create the first administrator. Then follow **Setup & help** in the app:
1. Start the dedicated *Automation Chrome* profile and sign in to ChatGPT manually.
2. Load `extension/` as an unpacked extension in that window, paste the key from **Settings → Generate new key**.
3. **Websites → Add website → Login (manual)** → sign in yourself → **Sync categories**.
4. **New article** → choose a writer and keywords.

Upgrading: stop `npm run dev:all` first, then `npm install && npm run setup` (migrations need the database free).
Browser: Playwright uses installed Chrome (`BROWSER_CHANNEL=chrome`). If Chrome lives somewhere non-standard, set `BROWSER_EXECUTABLE_PATH` in `.env`.

Production: `npm run build && npm run start:all`. Backup: `npx tsx scripts/backup.ts` (online `VACUUM INTO`, plus media). Extra users: `npm run user:create`.

## Architecture
| Part | Where |
|---|---|
| Next.js 15 dashboard + API (auth, CSRF, roles) | `src/app`, `src/lib/auth` |
| SQLite (WAL) via Prisma — all state, never reset | `prisma/schema.prisma`, `data/app.db` |
| Worker (single-owner lock, leases, recovery, retries) | `src/worker` |
| Writer pipelines (Celebrity 1.0, Celebrity 2.0, Tigram) | `src/modules/*/pipeline.ts` |
| Parsers / sanitizer / assembly / SEO / links | `src/lib/content` |
| ChatGPT agent protocol (claim/progress/complete/fail) | `src/lib/agent`, `src/app/api/agent` |
| MV3 extension | `extension/` |
| WordPress adapter + publication guard | `src/wordpress` |

### Safety model
- Drafts only. Every editor/REST mutation goes through `src/wordpress/publish-guard.ts`; status `publish|future|private|pending` is blocked at the network layer unless the site has `canPublish` (admin must type the site name) **and** the call comes from the scheduler flow (not implemented yet → nothing can publish).
- ChatGPT prompts are idempotent per stage operation; after a crash the extension reopens the conversation and **recovers the existing answer instead of resending**.
- WordPress creation persists the post ID immediately and reconciles by stored ID before ever creating again.
- Account-wide ChatGPT backoff (4s → 30s → 60s → 120s → 240s → 300s, honours Retry-After) on usage limits; login / human-check pauses instead of retrying. CAPTCHAs are never solved.
- Logs redact keys, cookies, tokens, passwords. Extension key stored only as SHA-256.

## Quality commands
```
npm run typecheck
npm test                # unit + integration (fake ChatGPT page in headless Chrome)
npm run build
npm run dev:all
```
See `BUILD_STATUS.md` for what is implemented, tested, and not yet verified against live services.
