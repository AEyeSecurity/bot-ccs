<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# BOT CCS project rules

- **Mandatory session handoff:** read [MEMORY.MD](MEMORY.MD) before starting analysis or changing this project in every new chat. Treat it as recent context, verify live state when needed, and follow the canonical docs for procedures.
- Update MEMORY.MD with every completed change or work session, in the same commit as the work. Record what changed, how, validation, decisions, pending work and the next step. Never include secrets, patient data or raw logs.
- MEMORY.MD must never exceed **50 lines**. Keep it as compact as possible: rewrite, merge and replace stale entries as work advances instead of appending an unlimited diary. Keep durable history in docs/CHANGELOG.md and detailed procedures in canonical docs.
- Every functional, operational, data-model, workflow, deployment, or user-interface change must include its corresponding documentation update in the same commit.
- Update `docs/CHANGELOG.md` for every completed change. Also update the relevant canonical document: `docs/ARCHITECTURE.md`, `docs/FEATURES.md`, `docs/CATALOG.md`, `docs/OPERATIONS.md`, or `docs/TESTING.md`.
- Do not commit secrets, patient data, runtime logs, generated test evidence, or local backups. Keep `.env.local` and credentials outside Git.
- Before completing a change, run the relevant tests plus `npm run lint` and `npm run build`. For production behavior, also run `npm run test:bot:report`.
- The published Supabase catalog is the only production content source. Do not introduce runtime fallbacks to XLSX or static TypeScript data.

# Commands

- Production uses Docker Compose, project bot-ccs. Follow docs/OPERATIONS.md. Host port 127.0.0.1:3010 reaches the single web container; do not start PM2 or native recovery tasks.
- Run the npm commands below inside the Compose tools service; build with Compose. Host Node, node_modules and .next are unnecessary. Read installed Next.js guides inside tools before changing framework code.
- Single test: `npx vitest run tests/unit/bot-core.test.ts`. Tests are **hermetic** — `tests/setup-env.ts` injects fake env and loads `data/bot-catalog-initial.json` as the published catalog, so no Supabase/Twilio/network is needed for `npm test`.
- Runtime env is injected from a private file outside Git; .env.local is only an optional local development source. /api/bot/* requires x-bot-ccs-secret, configured with Header Auth in existing n8n.
- DB: `npm run db:apply` and `npm run db:seed`. Migrations try `SUPABASE_DB_URL`; the Management-API fallback needs `SUPABASE_ACCESS_TOKEN` with `database_write` (else `403`).
- Catalog import pipeline: `npm run catalog:import -- "<xlsx>" "<out.ts>"` → `npm run catalog:generate-managed` → `npm run catalog:seed-managed`. Inspect with `npm run verify:catalog-db`.
- `npm run verify:catalog-admin-live` creates/publishes **real** catalog versions — run only when no admin draft is in progress.
- Conversation cleanup: `npm run maintenance:conversations`.

# Architecture

- The bot is **deterministic**: no LLM writes replies. `src/lib/bot-core.ts` (intent rules + case steps), `bot-catalog.ts` (`buildFlows` from the published catalog), `bot-engine.ts` (persistence, serializes inbound per phone number to avoid races).
- Runtime path: Twilio → n8n `POST /webhook/bot-ccs` → `/api/bot/inbound` → engine → Supabase → `/api/bot/send` (Twilio) → `/api/bot/outbound` + `/api/twilio/status`.
- Gemini has **two separate uses**, neither writes replies: (1) a lazy intent classifier invoked only when deterministic rules miss, via `classifyIntentWithGemini()` (`intent-classifier.ts`, called from `detectIntent` in `bot-core.ts`); (2) vision OCR for DNI/credential/medical-order media in `document-validation.ts`. The intent classifier is asynchronous, has a timeout and falls back to `OTRAS_CONSULTAS`; n8n no longer classifies intent.
- Publishing the catalog swaps the in-memory cache with **no build or restart**. A `revision` conflict returns `409`. Admin routes require the `admin` role (`401`/`403` otherwise); privileged writes use `service_role` server-side with RLS on.
- Sensitive media is fetched transiently into memory for Gemini validation, never stored as files or displayed in the CRM.

# Gotchas

- Runtime, maintenance and tooling are Linux containers; n8n stays on the existing shared server. Native deployment and one-time cutover scripts have been removed.
- Test reports persist in the Compose test_reports volume, never in a host source bind mount. Do not use down -v without deliberately discarding those reports.
- `data/Bot 2026 reconstruido.xlsx` and `src/lib/bot-2026-data.ts` are import/test-only sources, never runtime.

## Docker: configuración vigente desde 2026-10-16

Aplicación y mantenimiento en Docker Compose; n8n existente conserva el workflow editable y llama al puerto loopback3010 del host. Supabase sigue externo y conserva los datos. Cloudflare dedicado se configura con el perfil public y token propio. Las vCards se generan desde el catálogo publicado en /vcards/. BOT_CCS_WEBHOOK_SECRET es obligatorio, usando Header Auth en n8n. PM2 y tareas Windows son mecanismos históricos retirados al completar el corte. Ver docs/OPERATIONS.md y docs/TESTING.md.
