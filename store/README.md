# Getting Mahi Man live on the App Store and Google Play

What's ready, and what's left. Ticked items are done.

## 1. Do now (no domain or Stripe needed)

### Google Play
- [ ] **Play Console account.** Sign up at play.google.com/console ($25 USD, one-off).
  - **Organisation account (recommended).** Needs a D-U-N-S number for the business (free from Dun & Bradstreet, takes a few days). Lets you publish straight away.
  - **Personal account.** Google requires a closed test with **12 testers for 14 days in a row** before you can publish, so it's about 2+ weeks slower.
- [ ] Create the app: name "Mahi Man", App, Free, then accept the declarations.
- [ ] Fill in the **store listing** and **App content** using `google-play/listing.md`. All the text, answers and graphics are in that folder.
- [ ] Record the short **foreground service video** described in `listing.md` (on an Android phone, about 30 seconds).
- [ ] **Testing → Closed testing:** upload `android/app/build/outputs/bundle/release/app-release.aab` and add testers (the Cairns pilot people). Turn on Play App Signing.
- [x] Android app built: package `com.mahiman.app`, version 1.0 (1), signed with the upload key.
- [x] Store graphics: 512 icon, 1024×500 feature graphic, 4 phone screenshots.
- [x] Account deletion web page: `/support#delete`.

**Back up `~/Mahi Man Android Keys`** (upload.jks + keystore.properties) somewhere safe, like a password manager or an encrypted drive. Every Play update must be signed with it. If it's lost, Google can reset it, but that takes days.

### App Store
- [x] Version 1.0 has build 24 attached, plus the listing, screenshots, age rating, review notes and contact details.
- [x] TestFlight: build 24 is in beta review for the Cairns pilot group.
- [ ] In App Store Connect → **App Privacy**: answer the questionnaire (same data as the Play Data safety table in `google-play/listing.md`; none used for tracking).
- [ ] **App Information → Content Rights**: tick that you have the rights to the content.
- [ ] **Pricing and Availability**: Free, Australia.

## 2. When mahiman.app is live

- [ ] In Vercel, add `mahiman.app`, `www.mahiman.app` and `mahiman.com.au` to the project, and set the DNS records Vercel shows.
- [ ] Set up email for hello@mahiman.app (e.g. Google Workspace or forwarding with ImprovMX). It's the contact email on both stores, and Apple and Google email it.
- [ ] Switch the App Store and TestFlight links: `node store/apple-go-live.mjs`. It checks the pages load first.
- [ ] In Play Console, change the website, privacy policy and account-deletion URLs from mahiman.vercel.app to mahiman.app.

## 3. When Stripe is ready

- [ ] Stripe account activated (business details, bank account). Turn on **Connect** (Express accounts) for worker payouts.
- [ ] Add the secret key to Supabase: Project settings → Edge Functions → Secrets → `STRIPE_SECRET_KEY` = `sk_live_…`.
- [ ] Admin → Settings: paste the publishable key (`pk_live_…`), then turn off Pilot mode and/or turn on the booking fee.
- [ ] Redeploy the `api` edge function (also puts "MAHI MAN" on card statements).
- [ ] Update the App Store review notes and the Play "App access" note: they currently say there are no in-app payments.
- [ ] Play → App content → Financial features: add "service payments processed by a third party".
- [x] Worker payout setup works from the apps (Stripe returns to mahiman.app/payouts-done, and the app re-checks).

Card payments for real-world services (odd jobs) are allowed outside Apple's and Google's in-app purchase systems, so Stripe is fine on both stores.

## 4. Submit

- [ ] **App Store:** version 1.0 → Add for Review → Submit. Review usually takes 1–2 days.
- [ ] **Google Play:** Production → Create release → the same .aab (or a newer one) → Countries: Australia → Send for review. First review usually takes a few days, up to a week.
- [ ] Once each is live, set the store links so the website's "Get the app" button and QR code go to the right store. I can do this with two `settings` rows: `app_store_url` and `play_store_url`.

## Later (not needed to launch)

- **Android notifications:** needs a Firebase project. Add `google-services.json` to `android/app/`, upload the Firebase server key to Supabase, and turn Android on in `src/lib/push.ts` and the `send-push` function.
- **Sign in with Google** on Android (email codes work now).

## Building new versions

- **iOS:** `npm run ios`, bump `CURRENT_PROJECT_VERSION`, then archive and upload (Claude does this with the API key).
- **Android:** `npm run android`, bump `versionCode` in `android/app/build.gradle`, then `cd android && ./gradlew bundleRelease`. The .aab is in `android/app/build/outputs/bundle/release/`.
