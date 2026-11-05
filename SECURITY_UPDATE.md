# Together: Privacy hardening for shared use (2026-11-05)

## Installation order

1. Run `supabase/migrations/202611050002_privacy_hardening.sql` once in the **same** Supabase project (SQL Editor → New query → Run). Run after earlier Together migrations. Back up existing important data before running schema changes. It does not remove accounts, groups or activities, but it moves any previously group-visible **surprise-visit locations** into owner-only `surprise_details` and blanks the group-visible location columns.
2. Apply the updated frontend files (extract ZIP into repo or apply the patch). Deploy **immediately** after the SQL change.
3. Run `npm test && npm run build`, `npm audit --omit=dev --audit-level=high`, then commit/push only if all pass. Observe green GitHub Actions deployment.
4. Test with two separate accounts; do not store private real-world photos before tests pass.

## Security improvements

- Deletes of shared ideas and plans restricted to their creators at database level, not merely hidden in UI. Group owners can still delete an entire group and its shared content.
- New shared visits retain their actual creator as `owner_id`. Old visit records still have the activity creator as owner (original schema did not record real author), so those may need the activity creator to delete them.
- Photo metadata and ratings for surprise visits are hidden. Group-visible visit locations for existing surprises migrate into the creator-only secret note; new surprise visits have no shared visit location. Always keep a surprise's *activity* title/map pin/description generic: those are still visible to the group.
- Former members lose access to group content, surprise details, and additional participant writes (except information they saved before removal). Existing signed photo URLs last at most 5 minutes; revocation cannot cancel links already issued.
- Photo uploads are re-encoded locally (JPEG, PNG, WebP) to remove embedded EXIF/GPS metadata and reduce size. Animated GIF uploads are disabled; previously uploaded photos are not automatically cleaned.
- Sign-out/switch-account clears all account-derived data and drafts, cancels stale data responses, and persists group filters in per-user browser storage.
- Signed photo links live for five minutes and refresh while photos stay visible.
- Settings → Your data → **Full backup with photos (.zip)** bundles accessible record metadata and photo binaries. The ZIP is **not encrypted**: store it securely. Its JSON is not a one-click restore, and full restore is not implemented. Cap: 300 MB per download; use a desktop for large libraries. Verify backups open. Full ZIP may include shared group content and the current account's own surprises.

## Manual acceptance tests (REQUIRED before real users)

Use Account A and Account B, each in a different browser/profile, **not just switching tabs**:

1. A creates a private idea, a private note and a photo. B must not see or fetch any of them using B's credentials.
2. A creates a shared group and activity; B joins through an invite. Both can see the shared activity. B cannot delete an activity created by A, while A can.
3. B creates a **new** plan inside A's shared activity. B can delete B's own plan; A cannot delete B's plan. Existing plans retain legacy ownership and may behave differently.
4. A creates a generic surprise plan. B sees only its placeholder and planned date, not the surprise's private title, destination, photo metadata or rating. Check that the parent shared activity doesn't itself reveal the secret location.
5. A uploads a new photo taken on a GPS-enabled phone; download it and inspect the file metadata for location tags. Previously uploaded files may still contain tags.
6. Remove B from the group. B must lose access after refresh and cannot create/change votes/RSVPs for it through B's authenticated API. Already issued signed photo links can remain valid for at most five minutes.
7. Create a complete ZIP backup; verify it extracts correctly and contains `together-records.json` plus the image files. JSON-only export does not include photo bytes.
8. Sign out A and sign in B on the **same device/browser**. No A private data, photo, invite code, note, or previous group selection should remain visible. Try switching while a refresh is underway.
9. Ensure new people can actually sign in: Google OAuth consent screen may need to be published to Production instead of Testing, or a custom SMTP sender configured for email signup. Supabase's built-in email sender is rate-limited.

## Limits / caveats

- This is a code/RLS migration review, **not a live penetration test** of your deployed Supabase project. Existing RLS policies may differ if manually changed later. Explicitly test live permissions with independent accounts.
- Removing a group member cannot erase downloaded records, screenshots, cached photos, or already issued signed URLs.
- Database-driven deletion of an activity cascades photo **metadata**, not the object bytes in Supabase Storage; the orphaned bytes are inaccessible via the documented RLS but can still incur storage costs. Storage cleanup/backups should be managed separately.
- Users cannot self-serve full account/data erasure or restore complete backups. Group owner still has power to delete the whole group. Treat these as operational limits before inviting strangers.
- The frontend bundles a public Geoapify API key; keep its permitted origins restricted in Geoapify. Never put a Supabase **service-role/secret** key in GitHub Actions browser-build variables.
