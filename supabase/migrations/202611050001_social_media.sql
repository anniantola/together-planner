-- Together v0.2: Run once in Supabase SQL Editor BEFORE deploying the frontend.
-- Existing ideas, plans, votes and photos remain untouched.

-- Personal favourites are intentionally NOT group-visible.
create table public.activity_favorites (
 activity_id uuid not null references public.activities(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(activity_id,user_id)
);
alter table public.activity_favorites enable row level security;
create policy fav_read on public.activity_favorites for select to authenticated using (user_id=(select auth.uid()) and public.can_access_activity(activity_id));
create policy fav_insert on public.activity_favorites for insert to authenticated with check (user_id=(select auth.uid()) and public.can_access_activity(activity_id));
create policy fav_delete on public.activity_favorites for delete to authenticated using (user_id=(select auth.uid()));
-- Preserve existing favourites for the original creator; old shared flag is no longer used by the UI.
insert into public.activity_favorites(activity_id,user_id)
 select id,owner_id from public.activities where favorite=true on conflict do nothing;
-- Clear legacy group-visible favourite flag after backfilling; future favourites use the private table.
update public.activities set favorite=false where favorite=true;

-- Each user rates an occurrence independently; other participants may read their group's ratings.
create table public.experience_ratings (
 occurrence_id uuid not null references public.occurrences(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 rating integer not null check (rating between 1 and 5),
 updated_at timestamptz not null default now(),
 primary key(occurrence_id,user_id)
);
alter table public.experience_ratings enable row level security;
create policy ratings_read on public.experience_ratings for select to authenticated using (
 exists(select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id))
);
create policy ratings_insert on public.experience_ratings for insert to authenticated with check (
 user_id=(select auth.uid()) and exists(select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id) and o.status='completed' and o.visibility='normal')
);
create policy ratings_update on public.experience_ratings for update to authenticated using (user_id=(select auth.uid())) with check (
 user_id=(select auth.uid()) and exists(select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id) and o.status='completed' and o.visibility='normal')
);
create policy ratings_delete on public.experience_ratings for delete to authenticated using (user_id=(select auth.uid()));
-- Transfer previous plan-level ratings to their original creators.
insert into public.experience_ratings(occurrence_id,user_id,rating)
 select id,owner_id,rating from public.occurrences where rating is not null and status='completed' and visibility='normal' on conflict do nothing;

-- Inspiration photos live on ideas; existing memory photos remain on occurrences.
create table public.idea_photos (
 id uuid primary key default gen_random_uuid(),
 activity_id uuid not null references public.activities(id) on delete cascade,
 uploaded_by uuid not null references auth.users(id),
 path text not null unique,
 caption text check (length(caption)<=300),
 created_at timestamptz not null default now()
);
alter table public.idea_photos enable row level security;
create policy idea_photos_read on public.idea_photos for select to authenticated using (public.can_access_activity(activity_id));
create policy idea_photos_insert on public.idea_photos for insert to authenticated with check (
 uploaded_by=(select auth.uid()) and public.can_access_activity(activity_id)
 and path='ideas/'||activity_id::text||'/'||uploaded_by::text||'/'||id::text
);
create policy idea_photos_update on public.idea_photos for update to authenticated using (uploaded_by=(select auth.uid())) with check (
 uploaded_by=(select auth.uid()) and public.can_access_activity(activity_id)
 and path='ideas/'||activity_id::text||'/'||uploaded_by::text||'/'||id::text
);
create policy idea_photos_delete on public.idea_photos for delete to authenticated using (uploaded_by=(select auth.uid()));

-- Existing private 'memories' storage bucket. New path: ideas/<activity>/<user>/<photo>.
-- Both Supabase RLS and storage policies enforce membership; no public bucket access.
create policy idea_objects_read on storage.objects for select to authenticated using (
 bucket_id='memories' and split_part(name,'/',1)='ideas' and
 exists(select 1 from public.activities a where a.id::text=split_part(name,'/',2) and public.can_access_activity(a.id))
);
create policy idea_objects_insert on storage.objects for insert to authenticated with check (
 bucket_id='memories' and split_part(name,'/',1)='ideas' and
 split_part(name,'/',3)=(select auth.uid())::text and
 split_part(name,'/',4)<>'' and split_part(name,'/',5)='' and
 exists(select 1 from public.activities a where a.id::text=split_part(name,'/',2) and public.can_access_activity(a.id))
);
create policy idea_objects_delete on storage.objects for delete to authenticated using (
 bucket_id='memories' and split_part(name,'/',1)='ideas' and split_part(name,'/',3)=(select auth.uid())::text
);

-- The original database was configured with automatic table exposure disabled.
grant select,insert,delete on public.activity_favorites to authenticated;
grant select,insert,update,delete on public.experience_ratings to authenticated;
grant select,insert,update,delete on public.idea_photos to authenticated;

-- Existing memory photos need author-only caption editing.
create policy photos_update_caption on public.photos for update to authenticated
 using(uploaded_by=(select auth.uid())) with check(uploaded_by=(select auth.uid()));
grant update on public.photos to authenticated;
-- Prevent editing photo ownership/path using a trigger for both photo tables.
create function public.protect_photo_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id is distinct from old.id or new.path is distinct from old.path or new.uploaded_by is distinct from old.uploaded_by then
  raise exception 'Photo identity cannot be changed';
 end if;
 return new;
end; $$;
create trigger protect_idea_photo_identity before update on public.idea_photos for each row execute function public.protect_photo_identity();
create trigger protect_memory_photo_identity before update on public.photos for each row execute function public.protect_photo_identity();
create function public.protect_media_parent() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='idea_photos' and new.activity_id is distinct from old.activity_id then
  raise exception 'Cannot move a photo to another idea';
 elsif tg_table_name='photos' and new.occurrence_id is distinct from old.occurrence_id then
  raise exception 'Cannot move a photo to another experience';
 end if;
 return new;
end; $$;
create trigger protect_idea_photo_parent before update on public.idea_photos for each row execute function public.protect_media_parent();
create trigger protect_memory_photo_parent before update on public.photos for each row execute function public.protect_media_parent();

alter publication supabase_realtime add table public.idea_photos,public.activity_favorites,public.experience_ratings,public.photos;
