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
