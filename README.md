# Mahi Man

Odd jobs marketplace for Cairns, Queensland. Customers book fixed-price local jobs (cleaning, garden, moving and rubbish, assembly); verified local workers take them.

- Live: https://mahiman.vercel.app (moving to mahiman.com)
- Frontend: Vite + React + TypeScript, deployed on Vercel from `main`
- Backend: Supabase project "Odd Jobs Cairns" (Sydney region): Postgres with row-level security, storage, edge functions in `supabase/functions`
- Admin console: `/admin`, signed in as admin@mahiman.com
- Support: hello@mahiman.com

## iPhone app (TestFlight)

The Xcode project is in `ios/App/App.xcodeproj` (bundle ID `com.moremahi.app`, Swift Package Manager, no CocoaPods).
The web build is already copied into `ios/App/App/public`, so it opens and builds in Xcode with no extra steps.
After any web change: `npm run ios` (builds the web app and copies it into the iPhone project).
