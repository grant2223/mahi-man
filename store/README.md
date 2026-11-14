# Getting Mahi Man live on the App Store and Google Play

What's ready, and what's left. Ticked items are done.

## 1. Do now (no domain or Stripe needed)

### Google Play
- [x] Play Console: Find Fit People Ltd organisation account. App "Mahi Man: Need a hand?" (com.mahiman.app).
- [x] Store listing, graphics (mascot images labelled as AI-made), App content and Data safety all filled in.
- [x] Reviewer sign-in: review@mahiman.app. Its code is in `~/Mahi Man Android Keys/store-review-sign-in.txt` (no email is sent for this address).
- [x] Android notifications: Firebase project "mahi-man" (no Analytics), `android/app/google-services.json`, key in the Supabase secret `FCM_SERVICE_ACCOUNT`.
- [x] Location foreground-service declaration with the demo video (`google-play/location-sharing-demo.mp4`, shared from Google Drive).
- [x] **Live on Google Play** in Australia and New Zealand since 12 Nov 2026. Current release: **versionCode 14** (You and Account pages, alerts, splash, new icon, PDF invoices), live 14 Nov 2026. Earlier releases: 3, 4, 5, 6, 7, 8 (replaced by 10 in review), 10, 12. 9, 11 and 13 were never uploaded.
- [x] **Store icon and feature graphic** updated 14 Nov 2026: house logo off the shirt, and the feature graphic uses the splash slogan "Get the help you need within minutes." The icon is live; the feature graphic fix is in review (until then Play shows the 14 Nov version with "Post, accept, job done!").
- [ ] Play needs the **trader status declaration** by February 2027 (Play Console banner). It's a legal declaration, so you do it.
- [ ] Optional: App content, Target audience, tick "Restrict users that Google has determined to be minors".
- [ ] Internal testing release (draft): add tester emails if you want a private Android build before launch.

**Back up `~/Mahi Man Android Keys`** (upload key, keystore.properties, reviewer sign-in) somewhere safe, like a password manager or an encrypted drive. Every Play update must be signed with the upload key. If it's lost, Google can reset it, but that takes days.

### App Store
- [x] **Version 1.0 with build 28** (gift cards) has been waiting for App Store review since it was resubmitted on 12 Nov 2026. Review notes say gift cards are sold outside in-app purchase. Leave it in review; newer builds go with the next version.
- [x] **TestFlight, Cairns pilot group** (public link https://testflight.apple.com/join/XSdk2dnn): builds 27, 28, 29, 30, 31, 33, 35 and 37 are all approved for beta testing (checked 14 Nov 2026). Latest is **build 37**. 32, 34 and 36 were never uploaded.
- [ ] When Apple approves 1.0: set `app_store_url` in Admin → Settings so the website and /get send iPhones to the App Store instead of TestFlight.
- [x] App Review Information: tick sign-in required and enter review@mahiman.app with the code from `store-review-sign-in.txt` as the password. Note: "Enter the email, tap Email me a code, then type the code. No email is sent for this address."
- [x] In App Store Connect → **App Privacy**: answer the questionnaire (same data as the Play Data safety table in `google-play/listing.md`; none used for tracking).
- [x] **App Information → Content Rights**: tick that you have the rights to the content.
- [x] **Pricing and Availability**: Free, Australia and New Zealand.

## 2. When mahiman.app is live

- [x] `mahiman.app` and `www.mahiman.app` are live on Vercel (checked 14 Nov 2026).
- [ ] `mahiman.com.au` doesn't load yet: add it in Vercel and set its DNS.
- [ ] Set up email for hello@mahiman.app (no MX record on mahiman.app as of 14 Nov 2026) (e.g. Google Workspace or forwarding with ImprovMX). It's the contact email on both stores, and Apple and Google email it.
- [ ] Switch the App Store and TestFlight links: `node store/apple-go-live.mjs`. It checks the pages load first.
- [x] In Play Console, website, privacy policy and account-deletion URLs moved to mahiman.app (13 Nov 2026; privacy and data safety sent for review).

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

- [x] **App Store:** version 1.0 submitted (now with build 28, waiting for review).
- [x] **Google Play:** live in Australia and New Zealand.
- [x] `play_store_url` and `testflight_url` are set in Admin → Settings, so the website shows Google Play and the iPhone beta. `app_store_url` stays empty until Apple approves 1.0.

## New Zealand

NZ areas (Auckland, Wellington, Christchurch and 11 more) are in the `areas` table with `coming_soon = true`. The apps list them and show a "coming soon" panel there instead of jobs. To open one: add its suburbs, then in Admin → Areas turn it on (`active = true`). NZ prices would need NZD handling and NZ legal pages first.

## Later (not needed to launch)

- **Sign in with Google** on Android (email codes work now).

## Building new versions

- **iOS:** `npm run ios`, bump `CURRENT_PROJECT_VERSION` (last uploaded: 37), then archive and upload (Claude does this with the API key) and add the build to the Cairns pilot group.
- **Android:** `npm run android`, bump `versionCode` in `android/app/build.gradle` (last uploaded: 14), then `cd android && ./gradlew bundleRelease`. The .aab is in `android/app/build/outputs/bundle/release/`.
