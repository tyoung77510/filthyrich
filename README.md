# Filthy Rich 707 Football Club

A player-facing app for the club: sign up, view the tournament schedule, register for
tournaments, and post links to highlight reels and game film.

> **Name/branding is provisional.** "Filthy Rich 707" is a best guess from a voice-transcribed
> request plus this repo's name (`filthyrich`) — confirm the real spelling/branding before this
> goes live anywhere public. See `CLAUDE.md` for the other defaults assumed during scaffolding.

## Quick start

```bash
node backend/src/server.js
```

Then open http://localhost:3000.

Requires **Node ≥ 22.5** (for `node:sqlite`). No `npm install` needed — zero external
dependencies, same as the rest of the Level 7 codebase.

## What's here (v1)

- **Player accounts** — email/password signup and login.
- **Tournament schedule** — a public list of upcoming tournaments (name, dates, location,
  description).
- **Registration** — signed-in players can register (or cancel) for a tournament; each
  tournament page shows its current roster.
- **Player profile** — position, grad year, high school, height/weight, bio.
- **Video links** — players paste a link to a highlight reel or full game film hosted on
  YouTube, Vimeo, or Hudl. No file upload/storage — see `CLAUDE.md` for why.
- **Admin** — a user with `role = 'admin'` can create/edit/delete tournaments from the Admin tab.
  There's no signup flow for admins yet; promote a user directly in the database (see
  `CLAUDE.md`).

## Not built yet

- Tournament entry fees / payment collection (registration is roster-only right now).
- Direct video file upload (link-only for v1).
- Password reset / email verification.
- Team rosters beyond a single club-wide player pool (no sub-teams/age-groups yet).

## Project layout

```
backend/
  src/
    server.js   # HTTP server + routes
    db.js       # SQLite schema
    auth.js     # password hashing + sessions
  public/
    index.html  # the whole frontend (vanilla JS, no build step)
```

See `CLAUDE.md` for architecture notes and the assumptions made while scaffolding this.
