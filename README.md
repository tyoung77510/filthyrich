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

Requires **Node ≥ 22.5** (for `node:sqlite`). The backend itself needs no `npm install` — zero
external dependencies, same as the rest of the Level 7 codebase. `npm install` *is* needed if
you're touching the mobile app wrapper (`android/`, `ios/` — see below); that's a separate,
build-time-only toolchain (Capacitor) and doesn't touch anything the server runs.

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
- **Fundraising** — a public "Fundraising" tab listing the club's active/completed fundraising
  initiatives (title, description, optional $ goal with a progress bar, optional off-site donate
  link). No payment processing happens in-app — `link` points wherever the club actually collects
  money (GoFundMe, Venmo, a team store), and `raised_amount` is a number an admin updates by hand.
- **Admin** — a user with `role = 'admin'` can create/edit/delete tournaments and fundraisers from
  the Admin tab. The very first account created on a fresh install becomes admin automatically;
  every signup after that is a regular player. Promote someone else later directly in the database
  (see `CLAUDE.md`) until a proper admin-invite flow exists.

## Not built yet

- Tournament entry fees / payment collection (registration and fundraising are both roster/link-only
  right now — no payment processing in-app).
- Direct video file upload (link-only for v1).
- Password reset / email verification.
- Team rosters beyond a single club-wide player pool (no sub-teams/age-groups yet).
- Admin invite flow (only the bootstrap first-account-becomes-admin path exists).

## Mobile app (iOS / Android)

The frontend is mobile-optimized (bottom tab bar, single-column forms on narrow screens) and
there's a [Capacitor](https://capacitorjs.com) native shell scaffolded (`android/`, `ios/`) toward
real App Store / Play Store listings. **See `MOBILE.md` for the full status and what's still
blocking submission** — hosting, developer accounts, and iOS build/signing all need action outside
this repo.

## Project layout

```
backend/
  src/
    server.js   # HTTP server + routes
    db.js       # SQLite schema
    auth.js     # password hashing + sessions
  public/
    index.html  # the whole frontend (vanilla JS, no build step)
android/          # Capacitor native Android project (generated, mostly not hand-edited)
ios/              # Capacitor native iOS project (generated, mostly not hand-edited)
assets/           # source icon for `npm run cap:icons` (@capacitor/assets)
capacitor.config.json
```

See `CLAUDE.md` for architecture notes and the assumptions made while scaffolding this, and
`MOBILE.md` for the app-store path specifically.
