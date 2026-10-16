<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# BOT CCS project rules

- Every functional, operational, data-model, workflow, deployment, or user-interface change must include its corresponding documentation update in the same commit.
- Update `docs/CHANGELOG.md` for every completed change. Also update the relevant canonical document: `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, `docs/CATALOG.md`, `docs/OPERATIONS.md`, or `docs/TESTING.md`.
- Do not commit secrets, patient data, runtime logs, generated test evidence, or local backups. Keep `.env.local` and credentials outside Git.
- Before completing a change, run the relevant tests plus `npm run lint` and `npm run build`. For production behavior, also run `npm run test:bot:report`.
- The published Supabase catalog is the only production content source. Do not introduce runtime fallbacks to XLSX or static TypeScript data.

# Commands

- Web runs on port **3010**: `npm run dev` (dev), `npm run build` + `npm run start` (prod). PM2: `pm2 startOrReload ecosystem.config.cjs --update-env` (app name `bot-ccs-web`).
- Single test: `npx vitest run tests/unit/bot-core.test.ts`. Tests are **hermetic** — `tests/setup-env.ts` injects fake env and loads `data/bot-catalog-initial.json` as the published catalog, so no Supabase/Twilio/network is needed for `npm test`.
- Env comes from `.env.local` (gitignored; template `.env.example`). The `/api/bot/*` routes require header `x-bot-ccs-secret`.
- DB: `npm run db:apply` and `npm run db:seed`. Migrations try `SUPABASE_DB_URL`; the Management-API fallback needs `SUPABASE_ACCESS_TOKEN` with `database_write` (else `403`).
- Catalog import pipeline: `npm run catalog:import -- "<xlsx>" "<out.ts>"` → `npm run catalog:generate-managed` → `npm run catalog:seed-managed`. Inspect with `npm run verify:catalog-db`.
- `npm run verify:catalog-admin-live` creates/publishes **real** catalog versions — run only when no admin draft is in progress.
- Conversation cleanup: `npm run maintenance:conversations`.

# Architecture

- The bot is **deterministic**: no LLM writes replies. `src/lib/bot-core.ts` (intent rules + case steps), `bot-catalog.ts` (`buildFlows` from the published catalog), `bot-engine.ts` (persistence, serializes inbound per phone number to avoid races).
- Runtime path: Twilio → n8n `POST /webhook/bot-ccs` → `/api/bot/inbound` → engine → Supabase → `/api/bot/send` (Twilio) → `/api/bot/outbound` + `/api/twilio/status`.
- Gemini has **two separate uses**, neither writes replies: (1) an intent classifier that runs in n8n on every message but is consumed only as a last-resort fallback in `detectIntent` (`bot-core.ts:1099`); (2) vision OCR for DNI/credential/medical-order media in `document-validation.ts`.
- Publishing the catalog swaps the in-memory cache with **no build or restart**. A `revision` conflict returns `409`. Admin routes require the `admin` role (`401`/`403` otherwise); privileged writes use `service_role` server-side with RLS on.
- Sensitive media is never downloaded or stored — only hashes/minimal metadata are kept.

# Gotchas

- `ecosystem.config.cjs` hardcodes `cwd: "C:\BOT CCS"`; don't assume it tracks the checkout path.
- Windows/PowerShell only (PM2, Scheduled Tasks `BOT CCS Watchdog` and `BOT CCS Conversation Maintenance`, Cloudflare Tunnel).
- `data/Bot 2026 reconstruido.xlsx` and `src/lib/bot-2026-data.ts` are import/test-only sources, never runtime.
