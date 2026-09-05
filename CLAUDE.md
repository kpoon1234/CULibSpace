# CULibSpace

Monorepo for the CU LibSpace library seat booking system.

## Structure
- `apps/frontend/` — Next.js (App Router) + TypeScript — see `apps/frontend/CLAUDE.md` for frontend-specific conventions
- `apps/backend/` — Express.js + TypeScript + Prisma/PostgreSQL

## Design system
- Use the Impeccable skill (`.claude/skills/impeccable/`) for UI work — core commands: `/impeccable shape`, `/impeccable craft`, `/impeccable audit`, `/impeccable polish`
- Theme: white as the base (80-90%), Chula pink used only as an accent stripe (never a full-page pink background, never the Inter font)

## Hooks
- Impeccable hooks have been intentionally disabled in `.claude/settings.local.json`. If `npx impeccable install` is re-run in the future and the hooks reappear, clear them out again (see prior fix for reference).