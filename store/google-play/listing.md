# Google Play listing: Mahi Man

Copy each part into Play Console. Graphics are in this folder.

## Main store listing

**App name** (30 max)
Mahi Man: Need a hand?

**Short description** (80 max)
Post an odd job, pick a verified local, watch them arrive. Or earn doing jobs.

**Full description** (4000 max)

Get a hand with odd jobs around Cairns, or earn by doing them.

GET HELP
Post a job in a minute. Add photos, a video or just say what you need and Mahi Man writes it up for you. Set your price and what's included. Workers who are switched on nearby get an alert straight away.

Pick who comes. Before you choose, see each worker's photo, skills, verified licences, how often they turn up on time, and how past customers rated them. Message them in the app; your phone number and email are never shown.

Watch them on the way. When your worker taps I'm on my way, you see them on a map until they arrive.

Pay when it's done. You pay your worker directly by bank transfer or cash once the job is finished, never before. Mahi Man's connection fee is shown before you post: pay as you go, top up your balance for a lower fee, or join Plus if you book every week. Workers keep 100%.

DO WORK
Pick the jobs you're good at, switch on when you're free and take only the jobs you want. Workers keep 100% of the job price. Jobs that need a licence, like electrical work or an RSA, only go to workers whose licence we've checked.

JOBS PEOPLE POST
Cleaning, moving and lifting, rubbish and tip runs, garden, furniture assembly, handyman, pets, errands, events, babysitting and tutoring, tech help, and anything else you need a hand with.

SAFE AND FAIR
• Every worker's ID is checked by hand before their first job
• Only the worker who takes your job sees your street address
• Ratings both ways, revealed only once you've both left one
• Clear cancellation rules, with strikes for no-shows
• Report or block anyone, right in the app
• Delete your account any time in Settings

One account does both. Switch between Get help and Do work whenever you like.

**Graphics**
- App icon: `icon-512.png` (512 × 512)
- Feature graphic: `feature-graphic.png` (1024 × 500)
- Phone screenshots: `screenshots/01-home.png` to `04-earn.png` (1320 × 2640)

**Category**: Lifestyle (or House & Home). **Tags**: Home services, Local services, Jobs.
**Contact email**: hello@mahiman.app. **Website**: https://mahiman.app.
**Privacy policy**: https://mahiman.app/privacy.

## App content (Policy → App content)

**Privacy policy**: as above.

**App access**: "All or some functionality is restricted." Instructions for the reviewer:
> Sign in details ("Store review account"): username review@mahiman.app, password = the code in `~/Mahi Man Android Keys/store-review-sign-in.txt`. Instructions: No email is needed for this account. Open the app, tap Get help > Post a job (or Do work > Start earning), enter review@mahiman.app and tap Email me a code. On the next screen type the 6-digit code given as the password above. Browsing jobs works without signing in. There are no in-app card payments in this version. Customers pay workers directly, and Mahi Man's connection fee for the service is invoiced and paid by bank transfer (Settings > Payments). Digital purchases: none.

**Ads**: No, the app has no ads.

**Content rating** (IARC questionnaire): category "All other app types".
- Violence, sexuality, language, drugs, gambling: No to all.
- Users can interact or exchange content: **Yes** (in-app messages, job photos and reviews).
- Shares the user's current location with other users: **Yes** (a worker's trip to a job, shown to that customer).
- Digital purchases: No.
- Expect a rating around 12+ / Teen because of user interaction.

**Target audience**: 18 and over only. Not designed for children.

**News app**: No. **COVID-19 app**: No. **Government app**: No. **Financial features**: None. The connection fee is a fee for a real-world service, invoiced and paid by bank transfer; the app holds no money and offers no financial products. When Stripe card top-ups go on, update this to "Payments: service fees processed by a third party".

**Health apps**: No.

**Foreground service permissions**: declare **Location** (foregroundServiceType="location").
- What it does: "When a worker taps I'm on my way, their location is shared with that job's customer so the customer can see them coming. It keeps going while the worker navigates in a maps app, and stops when the worker enters the job's start code or cancels. A notification shows the whole time."
- Impact if deferred: "The customer's live map would freeze while the worker drives."
- Video: record a short screen recording on an Android phone: open a job, tap I'm on my way, switch to Google Maps (the notification is visible), come back and enter the start code. Upload it to YouTube as Unlisted and paste the link.

**Location permissions**: the app only asks for "while using the app" location. No background-location permission, so no background location declaration is needed.

**Data deletion**: account deletion URL: https://mahiman.app/support#delete.

## Data safety

Data is encrypted in transit: **Yes**. Users can request deletion: **Yes**. No data is sold or used for ads or tracking.
"Shared" means sent to another company. Service providers like Supabase and Stripe don't count as sharing, so answer **Collected, not shared** for everything below.

| Data type | Collected | Required? | Purpose |
|---|---|---|---|
| Personal info: Name | Yes | Required | App functionality, Account management |
| Personal info: Email address | Yes | Required | App functionality, Account management, Developer communications |
| Personal info: Phone number | Only if given | Optional | App functionality, Account management |
| Personal info: Address | Yes (job address) | Required for posting a job | App functionality |
| Personal info: Other info (ID type, ABN, licences) | Yes | Required for workers | App functionality, Fraud prevention, security and compliance |
| Financial info: Payment info (card brand, last 4, via Stripe) | Yes | Optional | App functionality |
| Financial info: Other financial info (worker PayID or bank account) | Yes | Required for workers | App functionality |
| Financial info: Purchase history (connection fee invoices, top-ups, balance) | Yes | Required for customers who book | App functionality |
| Location: Approximate location | Yes | Optional | App functionality |
| Location: Precise location | Yes | Optional | App functionality |
| Messages: Other in-app messages | Yes | Optional | App functionality |
| Photos and videos: Photos | Yes (job photos, ID check, profile) | Required for workers | App functionality, Fraud prevention, security and compliance |
| Photos and videos: Videos | Yes (job videos) | Optional | App functionality |
| App activity: Other user-generated content (job details, reviews) | Yes | Required | App functionality |
| App activity: App interactions (which partner offers are opened) | Yes | Optional | Analytics |
| App info and performance | No | | |
| Device or other IDs | No for now. Change to Yes (push token, App functionality) when Android notifications are turned on | | |

Launch location: the location used to pick the nearest area stays on the phone. Only the "I'm here" check-in and the "I'm on my way" trip send location to us, and that's what the Location rows above cover.

## Release

- Upload `android/app/build/outputs/bundle/release/app-release.aab`. Each release needs a higher versionCode in `android/app/build.gradle`: 3 was the first production release (12 Nov 2026), 4 adds payments, 5 adds gift cards.
- Accept **Play App Signing** when asked. Google keeps the app signing key; ours (in `~/Mahi Man Android Keys`) is only the upload key.
- Countries: Australia.
