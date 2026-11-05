-- Together: privacy hardening for real multi-user groups.
-- Run ONCE in Supabase SQL Editor after the initial + social migrations.
-- Does not delete data or remove existing memberships.
begin;

-- Deleting an activity cascades into all its visits and photo metadata. Only its
-- creator may delete it, including when shared with a group.
drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities for delete to authenticated
 using (owner_id = (select auth.uid())
        and (group_id is null or public.is_group_member(group_id)));

-- New visits belong to their creator, NOT automatically to the idea's creator.
-- For old visits, original creator information was not recorded and cannot be
-- reconstructed. Preserve old owner_id values; do not guess their authors.
create or replace function public.occurrence_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare a record;
begin
 select owner_id, group_id into a from public.activities where id = new.activity_id;
 if not found then raise exception 'Missing activity'; end if;
 if tg_op = 'UPDATE' then
   if new.activity_id is distinct from old.activity_id then
     raise exception 'Cannot move a visit to a different activity';
   end if;
   new.owner_id := old.owner_id;
 else
   new.owner_id := (select auth.uid());
   if new.owner_id is null then raise exception 'Sign in before creating a visit'; end if;
 end if;
 new.group_id := a.group_id;
 return new;
end; $$;

-- The older UX added visit coordinates to the group-visible occurrence row.
-- Preserve locations on existing surprises in their creator-only details first,
-- then redact the group-visible coordinates (including old records).
update public.surprise_details s
set details = concat_ws(E'\n', nullif(s.details,''),
  concat('Private visit location (migrated): ', coalesce(nullif(o.visit_location_label,''),'(unnamed)'),
    case when o.visit_lat is not null and o.visit_lng is not null
      then concat(' [',o.visit_lat,', ',o.visit_lng,']') else '' end))
from public.occurrences o
where o.id=s.occurrence_id and o.visibility='surprise'
 and (o.visit_location_label is not null or o.visit_lat is not null or o.visit_lng is not null);

insert into public.surprise_details (occurrence_id,creator_id,true_title,details)
select o.id,o.owner_id,null,
 concat('Private visit location (migrated): ',coalesce(nullif(o.visit_location_label,''),'(unnamed)'),
  case when o.visit_lat is not null and o.visit_lng is not null
    then concat(' [',o.visit_lat,', ',o.visit_lng,']') else '' end)
from public.occurrences o
where o.visibility='surprise'
 and (o.visit_location_label is not null or o.visit_lat is not null or o.visit_lng is not null)
 and not exists(select 1 from public.surprise_details s where s.occurrence_id=o.id);

update public.occurrences
set visit_location_label=null,visit_lat=null,visit_lng=null
where visibility='surprise'
 and (visit_location_label is not null or visit_lat is not null or visit_lng is not null);

-- Keep all sensitive plan fields out of shared surprise rows, including location.
create or replace function public.protect_surprise_occurrence()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.visibility='surprise' and (
   new.title_override is not null or new.memory is not null
   or new.rating is not null or new.actual_cost is not null
   or new.ticket_url is not null
   or new.visit_location_label is not null
   or new.visit_lat is not null or new.visit_lng is not null
 ) then
   raise exception 'Surprise-only details and locations must stay private';
 end if;
 return new;
end; $$;

drop policy if exists occurrences_delete on public.occurrences;
create policy occurrences_delete on public.occurrences for delete to authenticated
 using (owner_id = (select auth.uid()) and public.can_access_activity(activity_id));

-- Shared visits remain editable, but only the visit creator may alter a concealed
-- surprise. A plan containing photos may not become a surprise, because group
-- participants could otherwise retain pre-existing media links.
create or replace function public.protect_surprise_change()
returns trigger language plpgsql set search_path='' as $$
begin
 if (old.visibility = 'surprise' or new.visibility = 'surprise')
    and old.owner_id <> (select auth.uid()) then
   raise exception 'Only the visit creator can change a surprise';
 end if;
 if old.visibility is distinct from new.visibility
    and new.visibility = 'surprise'
    and exists (select 1 from public.photos where occurrence_id = old.id) then
   raise exception 'Remove shared memory photos before concealing this visit';
 end if;
 return new;
end; $$;
drop trigger if exists protect_surprise_change on public.occurrences;
create trigger protect_surprise_change before update on public.occurrences
 for each row execute function public.protect_surprise_change();

-- A group member removed from their group must also lose access to surprise
-- details that they authored when they were still a member.
drop policy if exists surprise_read on public.surprise_details;
create policy surprise_read on public.surprise_details for select to authenticated
 using (creator_id = (select auth.uid()) and exists (
   select 1 from public.occurrences o where o.id = occurrence_id
   and public.can_access_activity(o.activity_id)
 ));
drop policy if exists surprise_create on public.surprise_details;
create policy surprise_create on public.surprise_details for insert to authenticated
 with check (creator_id = (select auth.uid()) and exists (
   select 1 from public.occurrences o where o.id = occurrence_id
   and o.owner_id = (select auth.uid()) and o.visibility = 'surprise'
   and public.can_access_activity(o.activity_id)
 ));
drop policy if exists surprise_edit on public.surprise_details;
create policy surprise_edit on public.surprise_details for update to authenticated
 using (creator_id = (select auth.uid()) and exists (
   select 1 from public.occurrences o where o.id = occurrence_id
   and public.can_access_activity(o.activity_id)
 ))
 with check (creator_id = (select auth.uid()) and exists (
   select 1 from public.occurrences o where o.id = occurrence_id
   and public.can_access_activity(o.activity_id)
 ));
drop policy if exists surprise_delete on public.surprise_details;
create policy surprise_delete on public.surprise_details for delete to authenticated
 using (creator_id = (select auth.uid()) and exists (
   select 1 from public.occurrences o where o.id = occurrence_id
   and public.can_access_activity(o.activity_id)
 ));

-- Hide ALL memory photo metadata while a visit is concealed. Storage was already
-- protected, but the photo database table lacked the same visibility check.
drop policy if exists photos_read on public.photos;
create policy photos_read on public.photos for select to authenticated
 using (exists (
   select 1 from public.occurrences o where o.id = occurrence_id
   and o.visibility = 'normal' and public.can_access_activity(o.activity_id)
 ));
drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos for insert to authenticated
 with check (uploaded_by = (select auth.uid()) and exists (
   select 1 from public.occurrences o where o.id = occurrence_id
   and o.visibility = 'normal' and public.can_access_activity(o.activity_id)
 ) and path = occurrence_id::text||'/'||uploaded_by::text||'/'||id::text);
drop policy if exists photos_update_caption on public.photos;
create policy photos_update_caption on public.photos for update to authenticated
 using (uploaded_by = (select auth.uid()) and exists (
   select 1 from public.occurrences o where o.id = occurrence_id
   and o.visibility = 'normal' and public.can_access_activity(o.activity_id)
 ))
 with check (uploaded_by = (select auth.uid()) and exists (
   select 1 from public.occurrences o where o.id = occurrence_id
   and o.visibility = 'normal' and public.can_access_activity(o.activity_id)
 ));

-- A rating belongs to a participant and should not reveal concealed plans.
drop policy if exists ratings_read on public.experience_ratings;
create policy ratings_read on public.experience_ratings for select to authenticated
 using (exists (
   select 1 from public.occurrences o where o.id = occurrence_id
   and o.visibility = 'normal' and public.can_access_activity(o.activity_id)
 ));

-- Revoking group membership must revoke write access as well as read access.
-- Earlier policies for participants' updates/deletes only checked author identity.
drop policy if exists votes_delete on public.votes;
create policy votes_delete on public.votes for delete to authenticated
 using (user_id=(select auth.uid()) and public.can_access_activity(activity_id));

drop policy if exists rsvps_update on public.rsvps;
create policy rsvps_update on public.rsvps for update to authenticated
 using (user_id=(select auth.uid()) and exists (
  select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id)
 ))
 with check (user_id=(select auth.uid()) and exists (
  select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id)
 ));
drop policy if exists rsvps_delete on public.rsvps;
create policy rsvps_delete on public.rsvps for delete to authenticated
 using (user_id=(select auth.uid()) and exists (
  select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id)
 ));

drop policy if exists ticket_claims_update on public.ticket_claims;
create policy ticket_claims_update on public.ticket_claims for update to authenticated
 using (user_id=(select auth.uid()) and exists (
  select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id)
 ))
 with check (user_id=(select auth.uid()) and exists (
  select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id)
 ));
drop policy if exists ticket_claims_delete on public.ticket_claims;
create policy ticket_claims_delete on public.ticket_claims for delete to authenticated
 using (user_id=(select auth.uid()) and exists (
  select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id)
 ));

drop policy if exists ratings_delete on public.experience_ratings;
create policy ratings_delete on public.experience_ratings for delete to authenticated
 using (user_id=(select auth.uid()) and exists (
  select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id)
 ));
drop policy if exists fav_delete on public.activity_favorites;
create policy fav_delete on public.activity_favorites for delete to authenticated
 using (user_id=(select auth.uid()) and public.can_access_activity(activity_id));

drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos for delete to authenticated
 using (uploaded_by=(select auth.uid()) and exists (
  select 1 from public.occurrences o where o.id=occurrence_id
  and o.visibility='normal' and public.can_access_activity(o.activity_id)
 ));
drop policy if exists idea_photos_delete on public.idea_photos;
create policy idea_photos_delete on public.idea_photos for delete to authenticated
 using (uploaded_by=(select auth.uid()) and public.can_access_activity(activity_id));

drop policy if exists memory_objects_delete on storage.objects;
create policy memory_objects_delete on storage.objects for delete to authenticated
 using (bucket_id='memories' and split_part(name,'/',2)=(select auth.uid())::text
  and exists (select 1 from public.occurrences o
   where o.id::text=split_part(name,'/',1) and o.visibility='normal'
   and public.can_access_activity(o.activity_id)));
drop policy if exists idea_objects_delete on storage.objects;
create policy idea_objects_delete on storage.objects for delete to authenticated
 using (bucket_id='memories' and split_part(name,'/',1)='ideas'
  and split_part(name,'/',3)=(select auth.uid())::text
  and exists (select 1 from public.activities a
   where a.id::text=split_part(name,'/',2) and public.can_access_activity(a.id)));

-- Prevent even a private surprise record from being reassigned to another visit.
create or replace function public.lock_surprise_identity()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.occurrence_id is distinct from old.occurrence_id
    or new.creator_id is distinct from old.creator_id then
   raise exception 'Cannot change the owner or visit of surprise details';
 end if;
 return new;
end; $$;
drop trigger if exists lock_surprise_identity on public.surprise_details;
create trigger lock_surprise_identity before update on public.surprise_details
 for each row execute function public.lock_surprise_identity();

-- Reject GIF uploads to the photos bucket: our browser-side re-encoding strips
-- embedded metadata for JPEG/PNG/WebP, but does not safely preserve animated GIF.
-- Existing GIF objects are left untouched; check them manually if sensitive.
update storage.buckets set public=false, allowed_mime_types = array[
 'image/jpeg','image/png','image/webp'
] where id = 'memories';

commit;
