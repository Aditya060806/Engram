# Contributing to Engram

Thanks for considering a contribution. Engram is a self-organizing personal
knowledge graph built on Cognee.

## Getting started

1. Fork and clone the repo.
2. Backend setup: see [Local Setup](#8-local-setup) in the README — Python 3.11+, `pip install -r backend/requirements.txt`.
3. Frontend setup: `cd frontend && npm install && npm run dev`.
4. Copy `backend/.env.example` to `backend/.env` and fill in at least `GEMINI_API_KEY` or `GROQ_API_KEY`.

## Good first issues

Look for issues tagged `good first issue` on this repo. If none are open, check the
"Known Limitations" section of the README — several documented gaps there
(e.g. duplicate-source detection on re-ingestion, the localStorage-based chat
history) are concrete, well-scoped starting points.

## Code conventions

- **Backend**: type hints everywhere, Pydantic models for request/response shapes,
  never a bare `except:`.
- **Frontend**: TypeScript strict, Tailwind via the design tokens in
  `lib/design-tokens.ts` — no inline magic-number colors or spacing.
- Run `ruff check backend/` and `npx eslint .` (from the `frontend/` directory)
  before opening a PR; CI will run both automatically (see `.github/workflows/ci.yml`).

## Pull request process

1. One focused change per PR — don't bundle an unrelated fix with a feature.
2. Reference the issue your PR addresses.
3. Describe what you tested, not just what you changed.
