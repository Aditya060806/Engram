# Security Policy

## Reporting a Vulnerability

Please report security issues privately to aditya060806@gmail.com rather than
opening a public issue. We'll acknowledge within 48 hours.

## Known Security Model

- **API keys** for BYOK (bring-your-own-key) providers are encrypted at rest —
  see `backend/database.py`'s `encrypt_key`/`decrypt_key` functions using Fernet
  symmetric encryption.
- **Rate limiting**: 10 requests/second per IP via slowapi — configured in
  `backend/main.py`.
- **Authentication**: The app currently operates without enforced authentication
  during the hackathon judging window (see README "Known Limitations"). This is a
  deliberate, time-boxed decision, not an oversight, and will be revisited after
  judging concludes. A shared-secret gateway can be re-enabled by uncommenting
  `verify_llm_authorization` in `backend/main.py`.
- **Frontend-to-backend isolation**: All backend calls route through a server-side
  Next.js proxy at `frontend/src/app/api/proxy/[...path]/route.ts` — no direct
  backend calls from the browser.
