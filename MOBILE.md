# Getting this into the App Store and Play Store

> **Status:** 🟡 Native shell scaffolded, not yet buildable/submittable — several steps below need
> your action (accounts, money, a hosting decision) that I can't do for you. | **Last Updated:**
> 2026-09-08

## The short version

This app is a real backend (Node + SQLite, live registration/roster data) with a web frontend —
not a static site. To get it into both stores without a full native rewrite, it's wrapped with
**[Capacitor](https://capacitorjs.com)**: a thin native shell (real Xcode and Android Studio
projects) that displays the live web app inside a WebView, so all the existing code — routes,
auth, the mobile-responsive UI — keeps working as-is. This is the same approach a lot of real
consumer apps use to ship a web product to both stores without maintaining two separate codebases.

**What's done:**
- `capacitor.config.json` — app id `com.filthyrich7v7.app`, app name "Filthy Rich 7v7" (both
  placeholders, see below)
- `android/` and `ios/` — real, buildable native project scaffolds (`npx cap add android/ios`)
- App icons and splash screens generated for both platforms from your logo
  (`npm run cap:icons`, powered by `@capacitor/assets`)
- The frontend is already mobile-optimized (bottom tab bar, single-column forms, 16px inputs,
  `env(safe-area-inset-*)` padding so it doesn't collide with a notch or home indicator)

**What's blocking an actual store submission** — five separate things, tackled below in the order
that unblocks the most:

## 1. Get the backend hosted somewhere real (blocks everything else)

Right now the backend only runs on `localhost` inside whatever machine starts it. A phone can't
reach that. `capacitor.config.json` needs a real `server.url` pointing at a live, HTTPS backend
before the native shell has anything to show. This is the same "Deploying" gap noted in
`README.md`/`CLAUDE.md` — Railway, Render, Fly.io, or a VPS all work (needs a long-lived Node
22.5+ process + a persistent volume for the SQLite file). **Tell me which host you want and I can
walk through the setup** — this doesn't need anything from Apple or Google, so it's the fastest
thing to unblock.

## 2. Confirm the app identity (5-minute decision, but hard to change later)

- **App ID** (`com.filthyrich7v7.app`) — this is the iOS bundle ID / Android package name. It must
  be globally unique on each store, and **changing it after the first submission means a new store
  listing, not an update** — existing installs wouldn't auto-update to it. Worth getting right the
  first time. If the club ever gets a real domain, the conventional pattern is reversed-domain
  (e.g. a domain `filthyrich7v7.com` → `com.filthyrich7v7.app`, which is what I defaulted to,
  assuming that domain or similar).
- **App name** ("Filthy Rich 7v7") — shown under the home-screen icon. I shortened it from the
  full "Filthy Rich 7v7 Football Club" because long names get truncated on the home screen; the
  full name can still be used in the store listing title.
- **App icon** — generated directly from your logo file. Worth knowing: the logo is a full
  lockup (script wordmark + "7v7" + "FOOTBALL CLUB"), and at actual home-screen icon sizes
  (as small as ~40×40px on some Android densities) that much text gets hard to read. It looks
  right at App Store listing size (1024×1024) and reasonable on a home screen, but if you want a
  simplified icon-only mark (just a monogram or symbol) at some point, that's a quick regeneration
  once you have one — `npm run cap:icons` re-runs from a new `assets/icon.png`.

## 3. Apple Developer Program account — **you have to do this part**

$99/year, tied to your (or the club's) Apple ID, at
[developer.apple.com/programs](https://developer.apple.com/programs/enroll/). I have no way to
create or pay for this on your behalf. Needed for code signing and for submitting to the App
Store at all — there's no way around it, including for free/no-cost apps.

## 4. Google Play Developer account — **also yours to do**

$25 one-time, tied to a Google account, at
[play.google.com/console/signup](https://play.google.com/console/signup). Same deal — no way for
me to do this step.

## 5. Building and signing

- **Android**: can be built entirely from the command line (`./gradlew assembleRelease` inside
  `android/`) — no Mac needed. I can walk through generating a signing keystore and producing a
  release `.aab` once you're ready.
- **iOS: needs a Mac.** Xcode only runs on macOS — there's no way to build and sign an `.ipa` from
  this Linux environment. Two realistic paths: (a) you (or someone on the team) has a Mac and
  opens `ios/App/App.xcworkspace` in Xcode directly, or (b) a cloud Mac build service —
  **Codemagic**, **Ionic Appflow**, or **Bitrise** all support Capacitor projects specifically and
  handle this without you owning a Mac, for a monthly fee (Codemagic has a free tier that covers
  occasional builds). I can help configure whichever one you pick, but can't run Xcode myself.

## Everything else needed for a real submission (once the above is sorted)

Both stores also want: a **privacy policy URL** (this app collects email/password and player
profile data, so a real one is needed, not optional — I can draft the text, it just needs to be
hosted somewhere with a URL), **screenshots** per device size (I can generate these the same way
as the ones already sent — Playwright against the live app), **an app description**, a **support
contact**, and (Apple specifically) answers to an **App Privacy questionnaire** about what data is
collected and why.

## Suggested order

1. Pick a host, get the backend live on a real URL (unblocks testing the actual native shell)
2. Set `server.url` in `capacitor.config.json`, `npx cap sync`, install the app on a real
   Android phone via USB debugging to confirm it actually works end-to-end
3. Create the Google Play account, do the Android release build, submit — this whole path needs
   no Mac and is the fastest way to get *something* live
4. In parallel: create the Apple Developer account, decide on the Mac/cloud-build question for iOS
5. Privacy policy + store listing content (can happen anytime, doesn't block the above)

Tell me which of these you want to tackle next and I'll keep going.
