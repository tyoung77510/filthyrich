# CLAUDE.md

Guidance for Claude Code when working in this repository.

# Filthy Rich 707 Football Club

Player-facing app for the Filthy Rich 707 Football Club: players sign up, view the tournament
schedule, register for tournaments, and post links to their highlight reels / high school game
film. No club branding assets exist yet beyond the name — treat "Filthy Rich 707" as provisional
until the owner confirms exact spelling/branding.

## Run / build / test

```bash
node backend/src/server.js     # API + frontend at http://localhost:3000
```

- **Zero external dependencies.** Only Node's built-in `http` and `node:sqlite` — same philosophy
  as the Level 7 / Ordo7 codebase. Requires **Node ≥ 22.5**.
- **No build step.** `backend/public/index.html` is a single-file vanilla-JS frontend; edit it
  directly.
- **No automated tests yet.** Verify by running the server and driving the actual flow (curl or a
  browser).
- Config: `DATA_DIR` controls where the SQLite file lives (defaults to `backend/data/`, gitignored).
  `PORT` defaults to 3000.

## Architecture (`backend/src/`)

| File | Responsibility |
|---|---|
| `server.js` | HTTP server + manual route dispatcher. Auth gating and ownership checks live here. |
| `db.js` | SQLite schema (users, sessions, player_profiles, tournaments, registrations, videos) + `ensureColumn()` migration helper. |
| `auth.js` | `crypto.scrypt` password hashing + opaque bearer/cookie session tokens. |

`backend/public/index.html` is the whole frontend — nav between Schedule / Profile / Admin views,
`fetch`-based API calls, token kept in `localStorage`.

## Product decisions made without the owner's explicit sign-off (flag before treating as final)

These were defaulted during initial scaffolding because the owner declined the clarifying
questions asked at the time. Revisit with the owner rather than assuming they're locked in:

- **Video handling is link-only** (YouTube / Vimeo / Hudl URLs), not direct file upload. Chosen to
  avoid needing cloud storage/transcoding infrastructure for a v1. `server.js`'s
  `ALLOWED_VIDEO_HOSTS` allowlist enforces this — extend it if another platform should be
  supported, but don't quietly switch to raw file upload without discussing storage cost/infra.
- **No payment processing.** Tournament "registration" is a roster/RSVP action only — no Stripe
  integration, no entry-fee collection. If tournaments need to charge a fee, that's a real feature
  to design (see Ordo7's `billing.js` for the existing Level 7 pattern for Stripe-via-REST), not
  something to bolt on ad hoc.
- **Club name/branding** ("Filthy Rich 707 Football Club") is a best guess from a voice-transcribed
  request plus the `filthyrich` repo name — not confirmed by the owner. Confirm exact
  name/spelling/logo before this goes anywhere public-facing.

## Conventions

- **Authorization at the route layer**: every mutating route re-checks `req` for a valid session
  and, where relevant, ownership (`handleDeleteVideo` only lets the owner or an admin delete a
  video) or admin role (tournament create/edit/delete). Keep this pattern for new routes.
- **Schema changes go through `ensureColumn()`** in `db.js`, not by editing `CREATE TABLE` — an
  existing local DB won't pick up a new column otherwise. New columns must be nullable/defaulted.
- First user isn't auto-promoted to admin — there's no admin yet. Promote one manually:
  `sqlite3 backend/data/filthyrich.db "UPDATE users SET role='admin' WHERE email='...'"` (or via
  `node:sqlite` in a one-off script) until an admin-invite flow exists.
