# Getting Mahi Man live on the App Store and Google Play

What's ready, and what's left. Ticked items are done.

## 1. Do now (no domain or Stripe needed)

### Google Play
- [x] Play Console: Find Fit People Ltd organisation account. App "Mahi Man: Odd jobs, done" (com.mahiman.app).
- [x] Store listing, graphics (mascot images labelled as AI-made), App content and Data safety all filled in.
- [x] Reviewer sign-in: review@mahiman.app. Its code is in `~/Mahi Man Android Keys/store-review-sign-in.txt` (no email is sent for this address).
- [x] Android notifications: Firebase project "mahi-man" (no Analytics), `android/app/google-services.json`, key in the Supabase secret `FCM_SERVICE_ACCOUNT`.
- [x] Location foreground-service declaration with the demo video (`google-play/location-sharing-demo.mp4`, shared from Google Drive).
- [x] **Production 1.0 (versionCode 3) sent for review on 12 Nov 2026**, Australia and New Zealand. Live on 12 Nov 2026.
- [x] **Production 1.0 (versionCode 4, payments) sent for review on 12 Nov 2026**, with the new description, Data safety (Purchase history) and sign-in note. Rolls out to 100% once approved.
- [ ] **Release versionCode 5 (gift cards).** Build the .aab, Production → Create new release → upload → Send for review. Nothing to change in the listing: gift cards pay for real-world jobs, so they're not digital purchases.
- [ ] Optional: App content, Target audience, tick "Restrict users that Google has determined to be minors".
- [ ] Internal testing release (draft): add tester emails if you want a private Android build before launch.

**Back up `~/Mahi Man Android Keys`** (upload key, keystore.properties, reviewer sign-in) somewhere safe, like a password manager or an encrypted drive. Every Play update must be signed with the upload key. If it's lost, Google can reset it, but that takes days.

### App Store
- [x] Version 1.0 has build 26 attached (has the reviewer sign-in), plus the listing, screenshots, age rating, review notes and contact details.
- [x] TestFlight: build 25 approved for the Cairns pilot group; build 26 in beta review; build 27 (payments, jspdf) in the Cairns pilot group, beta review sent 12 Nov.
- [ ] App Review Information: tick sign-in required and enter review@mahiman.app with the code from `store-review-sign-in.txt` as the password. Note: "Enter the email, tap Email me a code, then type the code. No email is sent for this address."
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
Mahi Man gift cards are the same: they only pay for real-world jobs (the worker and the connection fee), so they're sold outside in-app purchase too. If a reviewer asks, say that.

## 4. Submit

- [ ] **App Store:** version 1.0 → Add for Review → Submit. Review usually takes 1–2 days.
- [ ] **Google Play:** Production → Create release → the same .aab (or a newer one) → Countries: Australia → Send for review. First review usually takes a few days, up to a week.
- [ ] Once each is live, set the store links so the website's "Get the app" button and QR code go to the right store. I can do this with two `settings` rows: `app_store_url` and `play_store_url`.

## New Zealand

NZ areas (Auckland, Wellington, Christchurch and 11 more) are in the `areas` table with `coming_soon = true`. The apps list them and show a "coming soon" panel there instead of jobs. To open one: add its suburbs, then in Admin → Areas turn it on (`active = true`). NZ prices would need NZD handling and NZ legal pages first.

## Later (not needed to launch)

- **Android notifications:** needs a Firebase project. Add `google-services.json` to `android/app/`, upload the Firebase server key to Supabase, and turn Android on in `src/lib/push.ts` and the `send-push` function.
- **Sign in with Google** on Android (email codes work now).

## Building new versions

- **iOS:** `npm run ios`, bump `CURRENT_PROJECT_VERSION`, then archive and upload (Claude does this with the API key).
- **Android:** `npm run android`, bump `versionCode` in `android/app/build.gradle` (last uploaded: 4), then `cd android && ./gradlew bundleRelease`. The .aab is in `android/app/build/outputs/bundle/release/`.
