# Together — private date planning, events and memories

A couples-first, friends-friendly collaborative PWA. Save flexible date ideas, time-limited exhibitions and fixed concerts; plan across private and shared spaces; surface ticket-sale and booking deadlines; map places; vote, RSVP, preserve memories and photos.

**Private by design:** GitHub Pages hosts only the public *application code*, never the user data. Supabase Auth, PostgreSQL row-level security (RLS) and a private Storage bucket protect actual content. Never publish a service-role key.

## Quick start: put this folder in a new GitHub repository

1. Create a **new empty repository** on GitHub, for example `together-planner`. Upload/push the *contents* of this folder, including `.github/workflows/deploy.yml`, to the `main` branch. You can use Git on your computer:

   ```bash
   git init
   git add .
   git commit -m "Initial Together application"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/together-planner.git
   git push -u origin main
   ```

2. Create a new **Supabase** project at https://supabase.com. In **SQL Editor**, run `supabase/migrations/202611040001_initial.sql` *once*, against a fresh project. This creates tables, triggers, invitation RPC, authorization policies and private `memories` storage bucket.
3. In Supabase **Authentication → URL Configuration**: set **Site URL** to `https://YOUR-USERNAME.github.io/together-planner/`. Add that exact URL under **Redirect URLs**. For local development also add `http://localhost:5173/`. Configure an email provider for production; the default email service has limitations.
4. In GitHub **Settings → Secrets and variables → Actions → Variables**, add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Supabase **publishable / anon** key (NOT service-role) |

   The publishable key is public by design. Security comes from Supabase RLS, not concealing this key.
5. GitHub **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**. Open **Actions** to run the workflow (or make another commit). The app will be at `https://YOUR-USERNAME.github.io/together-planner/`. Allow GitHub Pages deployment if your repository settings require it.
6. Open the URL, sign up and confirm your email, then create a couple or friends group. Share an invitation code privately (Groups → Invite), and have others register and join with that code.

> **Important:** You *must* configure Supabase before the application can log anyone in. Uploading the folder alone creates the website, but not a database or secure authentication. Never enter real private information until RLS is installed and verified.

### Local development

```bash
cp .env.example .env.local
# Fill in your Supabase URL and publishable/anon key
npm install
npm run dev
npm run check
```

Node 22 is recommended. Use `npm run build` for the production bundle. `VITE_BASE_PATH=/` is the default for local development; GitHub Actions automatically sets it to `/REPOSITORY-NAME/`.

## What is implemented

- **Auth / privacy:** Email + password accounts, sign-in, sign-up, reset email, password change, profile names, server-enforced private My Space, per-group member access, group ownership, expiring invitation codes, group leave/remove/delete. Shared idea edits are collaborative.
- **Ideas:** Categories, search, tags, links, estimated price, duration, season, weather, favourites, notes private even on shared ideas, save an idea in seconds, copy an idea to another group *without* copying private data.
- **Date Jar:** Random uncompleted idea from the current filtered list.
- **Plans:** Separate repeatable occurrences linked to an idea; proposal/planned/confirmed/completed/cancelled; fixed dates, end times, exhibition windows, ticket on-sale time, booking deadline, ticket link/status/count, per-person ticket reservations, actual costs, ratings, shared memory, weekly/monthly/annual recurrence in the calendar.
- **Home:** Prioritised reminders for approaching booking deadlines, ticket on-sale dates, expiring opportunities and imminent events; upcoming plans, unscheduled ideas, recent memories.
- **Calendar:** Month, week and agenda modes, selectable groups plus private entries; add a dated plan from a calendar day; privacy-safe `.ics` export. Group visibility preferences persist on the device.
- **Map:** Leaflet/OpenStreetMap map, pin selection from an idea editor, visited/upcoming/idea filters, optional approximate locations, group visibility controls. Home-based dates do not need coordinates.
- **Social:** Interest reactions, RSVP responses, private invitation codes; couple/friends/family/custom group types; all groups retain the same capabilities.
- **Memories:** Completed plans, 1–5 star ratings, expenses, journal notes and private-bucket photos (10 MB each). Repeat visits preserve earlier occurrences.
- **Surprises:** Placeholder shared activity + hidden true title/details in an owner-only table. See privacy cautions below.
- **Extras:** Dark/light theme, installable PWA, in-app urgency indicators, JSON record export and private-ideas import, private photo access with signed URLs, realtime change subscriptions, HTML metadata suggestion from event URLs (optional Edge Function).

## Optional event URL import

The app has a *Suggest details from website* button. For it to work, deploy `supabase/functions/import-event` using the Supabase CLI:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy import-event
```

This is **best-effort** extraction of HTML title/description; many ticketing websites block bots or require JavaScript. It does not automatically confirm ticket availability, dates or prices. Always check suggested information manually. Security protections reject non-public hostnames/addresses and redirects, but for strict threat models you should place URL fetching behind a vetted egress proxy.

## Deployment / security notes

- Never enable public read access on the Supabase `memories` bucket. Only signed photo URLs are displayed. Signed URLs expire after five minutes; already-loaded photos may remain in a browser cache.
- Members of a group can read/edit shared idea and plan rows. **Do not put secret surprises in a shared idea title, location, description, ticket URL or shared plan memory.** Create a generic `Surprise plan` idea, then mark its occurrence `surprise` and store sensitive detail in the private fields. The date and placeholder remain visible to members. You must reveal a surprise (change status to normal) before uploading shared photographs. Creator-specific secret data is never exported to other members by the RLS policy.
- Group codes are random, expire after seven days, have ten uses and can be revoked by deleting them in Supabase; distributing them to strangers grants group access. Removing members stops future access but cannot erase data they previously downloaded.
- A single activity belongs to one space. Sharing makes an independent idea copy. This intentionally prevents accidental cross-group leakage of votes, photos, private notes and calendar events.
- Closed-app/background push notifications, automatic third-party ticket monitoring, two-way external calendar sync, collaborative offline conflict resolution, photo-binary backup, map place-name search and full event-site scraping are **not implemented**. The Home page tracks deadlines whenever the app is opened. In-session browser alerts can notify for imminent deadlines within one day while the page remains open; background delivery requires an authenticated push backend.
- PWA app shell is cached for offline navigation, but **database content requires a connection**. Offline edits are not queued or silently discarded as successful saves. Reconnect before saving collaborative changes.
- **Calendar timezone:** Times are entered in the user's device timezone and stored as UTC. Users in other timezones see converted local times. The .ics export uses UTC.
- **Recurring occurrences:** Weekly/monthly/yearly display is calculated from the original occurrence. Editing a displayed recurrence edits the underlying series; per-instance exception editing is not yet supported.
- **Backups:** JSON exports include metadata for accessible photo records but not their binary files. Also, backups may include shared and surprise data: handle exports securely.

## Testing and CI

`npm run check` runs unit tests and TypeScript/Vite production build. The workflow runs both on every main-branch push and pull request, and publishes GitHub Pages only from main. Tests cover URL safety, recurrence expansion, urgent reminders and redaction of surprises from calendar export.

### Manual acceptance tests (use two *different* accounts)

1. A signs up, creates a group and shares an invite code; B joins it. B sees shared ideas but cannot see A's My Space entries.
2. A creates a private note on a shared idea. B should not be able to query the note even via the Supabase REST API using B's access token.
3. A creates a generic surprise event and privately enters its details. B sees only the placeholder and time. Export B's calendar and confirm no private title or text appears.
4. A pins an activity and adds a completed occurrence with a photo. B can see the shared photo. A personal memory photo is invisible to B unless explicitly shared into a group.
5. B leaves a group. Verify previously accessible group data and photo URLs cannot be fetched with fresh credentials. (A previously issued 5-minute signed URL can remain accessible until expiry.)
6. Turn off a group in the calendar selector. Confirm that calendar, Home, Map and Memories reflect the selection, but group membership is unchanged.
7. Enter a ticket-sale date within seven days, and an event date later. Confirm Home shows the ticket deadline independently of the event date.
8. Verify dark mode, mobile 320px layout, add/edit flows, email confirmation, password reset, PWA install and exports on your own devices.

## Structure

```text
.github/workflows/deploy.yml  GitHub Actions CI + Pages
src/App.tsx                  Responsive app, auth, interactions
src/components/ActivityMap.tsx  Map and pin picker
src/lib/                    Types, dates, .ics, Supabase client
src/styles.css              Dark/light responsive styling
supabase/migrations/         PostgreSQL + RLS setup
supabase/functions/import-event/  Optional URL metadata fetcher
tests/                      Unit tests
public/icon.svg             PWA icon
```

## Next engineering priorities

This is a functional first implementation, not a claim of production-complete coverage of every brainstormed enhancement. High-priority follow-ups: server-side scheduled notifications (email/push), location autocomplete, multiple photo exports, a richer year scrapbook and statistics dashboard, per-occurrence recurring edits, per-member hidden-surprise controls, offline optimistic sync with conflict resolution, end-to-end authenticated security tests, group member display-name joins, and a true availability-aware Date Jar. These are separately documented rather than silently pretending they work.

## Authentication UX and email provider

Email/password signup explains that verification is required and shows an explicit confirmation screen. This screen supports resending the email after a 60-second cooldown. The cooldown protects against accidental repeated requests but cannot bypass the project-wide mail quota. Authentication errors are presented with actionable messages, including rate-limit and unverified-address explanations. Password recovery leads back to Settings to set a new password.

**Production email:** Supabase's default sender currently has a project-wide limit of 2 emails/hour and only supports the organization team's email addresses. Before inviting other users, configure **Authentication → SMTP Settings** (or Send Email hook) with a provider/domain authorized to send your mail. Leave email confirmation ON. Changing frontend code does not raise this quota.

**Optional Google sign-in:** Configure Google OAuth credentials in Google Cloud, enable **Authentication → Sign In / Providers → Google** in Supabase, set its callback URL to the one supplied by Supabase, and set GitHub Actions repository variable `VITE_ENABLE_GOOGLE_AUTH=true`. Redeploy. Google sign-in is intentionally hidden until configured. Do not enable the flag before the provider is operational.

## Social, photo and map improvements — follow-up migration (November 2026)

**Run `supabase/migrations/202611050001_social_media.sql` once in the SAME Supabase project in SQL Editor, before deploying the upgraded frontend.** It adds three RLS-protected tables (private per-person favourites, per-person ratings, inspiration photos), author-only photo-caption editing and private Storage policies. Existing accounts, groups, ideas, visits, votes, and photos remain intact. Existing shared `favorite` flags and legacy completed-visit ratings migrate to the original creator's personal values. Do NOT repeat the initial migration or wipe your database. If the database schema has not been upgraded, the new client will report missing-table errors.

### How the new interactions work

- **Ideas → hearts:** tap the heart to vote Love, tap again to undo; the Details panel offers Love / Maybe / Pass, each togglable. Vote totals are shared with the group.
- **Ideas → ☆:** toggle your *private* favourite directly on the card or in Details. Filter by "★ My favourites". Other group members cannot query your personal favourites.
- **Plans → completed visit → Your experience rating:** each participant gives their own 1–5 star rating. Group average and rating count appear in Memories and the plan detail. The old shared rating field is no longer edited.
- **Idea → Details → Inspiration photos:** add multiple photos, see previews and write a caption before uploading. Memory photos have the same workflow. Photo captions can be edited by the uploader; media and database rows stay private to the user/group via RLS. 8 files per batch, 10 MB each.
- **Ideas → Edit → Search a place or address:** type a venue, landmark or street address, press "Find place", select a verified result, and its label and coordinates are filled automatically. Manual pins remain possible. **Map** has the same finder, with a "Save this place as an idea" action. Map markers feature category emojis and distinct idea / planned / visited colours, with an additional personal-favourites map filter.

### Enable Geoapify place/address search (optional free provider)

1. Sign up at https://myprojects.geoapify.com/ and create a free project. The free plan currently allows 3,000 API credits per day without a credit card. The app uses the Geocoding API, *not* Google Maps billing.
2. Under API Keys, restrict your **browser key** to the Together GitHub Pages referrer/origin `https://anniantola.github.io` (and, if needed, your local development origin). Test restrictions after saving. A Vite browser key is never secret, so domain restrictions are important.
3. In GitHub repository **Settings → Secrets and variables → Actions → Variables**, add `VITE_GEOAPIFY_API_KEY` with the restricted Geoapify key. The deployment workflow passes this value to the client. Trigger a new push to rebuild. For local development, put it in `.env.local`.
4. Until configured, place search clearly indicates it is disabled; all existing manual map functionality continues to work.

Location lookups are triggered **only when users press Find place**. Search text is transmitted to Geoapify, so don't search private residential addresses. Saved map locations are visible to authorized members of the idea's space, and public map tile servers receive the viewed map area. No location permission is requested from your device. Check Geoapify usage terms and API quota for broader releases.

### Acceptance checks after migration

- With two accounts in the same group, verify both can heart a shared idea and independently unheart it; each user sees only their own ⭐ favourites.
- Complete a shared plan, submit different ratings from two accounts, verify the mean; clearing one updates the count.
- Attach idea photos with captions and memory photos, verify they show to members but not a nonmember; check caption edit/delete by uploader only.
- Search for a museum and street address, choose a result, verify the map pin location and emoji/status colour. Try search with the API key disabled and confirm manual map selection still works.
- Photo deletion from another member may leave an orphaned object in private Storage when its parent is removed; we need a server-authorized storage-cleanup workflow before relying on this as a permanent photo archive.
- Open the app at 320px on mobile in dark mode; confirm no form overflow and that the signed-in Google flow remains unaffected.

## Activity → plan → memory redesign (Nov 2026)

**Database prerequisite:** Before deploying this version, run `supabase/migrations/202611050002_event_details.sql` once in the Supabase SQL Editor. The previous social/photo migration remains required. The new migration adds optional event-level dates/deadlines and visit-specific location snapshots. Existing activities, plans and memories are not deleted. Do not rerun the initial migrations.

**Concept:** An activity is the enduring idea or fixed event. One activity can have several visit plans. Each completed visit becomes one memory. An event's fixed date, availability window, ticket-sale date and booking deadline are stored independently from the dates a group decides to attend. Existing undated ideas continue to work.

**Using the interface:**
- Home / header: **Add idea** or **Add event**. Both save an activity in one form, with progressive sections for basics, location, event dates, extras and selected photos. You can create an event with fixed dates without committing to a visit.
- Open an activity from Home, Ideas, Calendar, Map or Memories to reach the same three-pane view (**Overview**, **Plans**, **Memories**). Closing it leaves your original page and filters unchanged.
- On **Overview**, edit activity basics, suggested location, event timing, photos, private notes or sharing using labelled actions.
- **Plans:** choose the actual visit date/location, status, booking/ticket details and optional advanced options. A proposed plan is not shown as a committed upcoming plan.
- **Mark completed** directly from a plan; fill a memory, actual cost, your own rating and several photos together. Completed visits show in Memories. Each group member maintains an individual rating.
- **Memories:** view or edit a completed visit's memory and photographs without navigating to a separate edit screen.
- Edits to the suggested activity location no longer rewrite existing visits' location snapshots; the one-time SQL migration backfills them.
- Closing an edited activity/plan/memory prompts before discarding unsaved changes, including selected photographs. Photo files and captions are staged and uploaded only after a record exists.

**Calendar:** Fixed event dates appear even when no visit has been booked, labelled *event date (not a plan)*. A confirmed/planned visit on the same day suppresses the redundant fixed-event calendar marker. ICS exports include fixed event dates as tentative events and preserve visit-specific locations.

**Operational checks:** Run `npm test && npm run build`, push to `main`, wait for GitHub Pages to finish, then reopen on a fresh mobile browser session. Exercise personal and group activities using separate accounts; verify owner-only ratings/favourites and photo access. SQL migrations and browser RLS tests require the actual Supabase project and cannot be validated by static code analysis alone.
