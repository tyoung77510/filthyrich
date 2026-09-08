# Filthy Rich 7v7 Football Club

A player-facing app for the club: sign up, view the tournament schedule, register for
tournaments, and post links to highlight reels and game film.

> Branding (name, logo, black/gold palette) comes from the owner's own logo file
> (`backend/public/brand/logo.png`). See `CLAUDE.md` for the remaining defaults assumed during
> scaffolding that still need sign-off (video handling, no payment processing).

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
- **Public player directory** — a "Players" tab anyone can browse (no account needed), searchable
  by name/position/high school/city, linking to each player's public profile and videos. Email is
  never exposed here or on a public profile page — only the signed-in owner sees their own email.
- **Admin** — a user with `role = 'admin'` can create/edit/delete tournaments from the Admin tab.
  The very first account created on a fresh install becomes admin automatically; every signup
  after that is a regular player. Promote someone else later directly in the database (see
  `CLAUDE.md`) until a proper admin-invite flow exists.

## Not built yet

- Tournament entry fees / payment collection (registration is roster-only right now).
- Direct video file upload (link-only for v1).
- Password reset / email verification.
- Team rosters beyond a single club-wide player pool (no sub-teams/age-groups yet).
- Admin invite flow (only the bootstrap first-account-becomes-admin path exists).

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
