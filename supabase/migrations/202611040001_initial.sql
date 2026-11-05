-- Together: run once in Supabase SQL Editor or through Supabase CLI.
-- All application tables are inaccessible to unauthenticated visitors.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Someone' check(length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);
create function public.on_user_created() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values (new.id,coalesce(nullif(left(new.raw_user_meta_data->>'display_name',80),''),'Someone'));
 return new;
end; $$;
create trigger create_profile after insert on auth.users for each row execute function public.on_user_created();
insert into public.profiles(id,display_name)
select id,coalesce(nullif(left(raw_user_meta_data->>'display_name',80),''),'Someone') from auth.users on conflict do nothing;

create table public.groups (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 100),
 kind text not null default 'couple' check(kind in ('couple','friends','family','custom')),
 created_at timestamptz not null default now()
);
create table public.memberships (
 group_id uuid not null references public.groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key(group_id,user_id)
);
create function public.is_group_member(g uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where group_id=g and user_id=(select auth.uid()))
$$;
create function public.is_group_owner(g uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.groups where id=g and owner_id=(select auth.uid()))
$$;
create function public.on_group_created() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.memberships(group_id,user_id) values(new.id,new.owner_id); return new; end; $$;
create trigger join_creator after insert on public.groups for each row execute function public.on_group_created();
create function public.lock_group_owner() returns trigger language plpgsql set search_path='' as $$
begin if new.owner_id <> old.owner_id then raise exception 'Group owner is immutable'; end if; return new; end; $$;
create trigger protect_group_owner before update on public.groups for each row execute function public.lock_group_owner();

create table public.invitations (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
 code text not null unique, created_by uuid not null references auth.users(id),
 expires_at timestamptz not null default (now()+interval '7 days'),
 max_uses int not null default 10 check(max_uses between 1 and 100), uses int not null default 0 check(uses >= 0),
 created_at timestamptz not null default now()
);
create function public.accept_invitation(invite_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; record_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
 select id,group_id into record_id,target from public.invitations
 where code=invite_code and expires_at > now() and uses < max_uses for update;
 if target is null then raise exception 'Invite is expired or invalid'; end if;
 insert into public.memberships(group_id,user_id) values(target,(select auth.uid())) on conflict do nothing;
 if found then update public.invitations set uses=uses+1 where id=record_id; end if;
 return target;
end; $$;
revoke all on function public.accept_invitation(text) from public,anon;
grant execute on function public.accept_invitation(text) to authenticated;

create table public.activities (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 group_id uuid references public.groups(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 180), description text not null default '',
 category text not null default 'Other', tags text[] not null default '{}',
 url text, estimated_cost numeric(10,2) check(estimated_cost >= 0),
 duration_minutes int check(duration_minutes > 0 and duration_minutes < 100000),
 location_label text, lat double precision check(lat between -90 and 90),
 lng double precision check(lng between -180 and 180), approximate boolean not null default false,
 season text, weather text, favorite boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index activities_group_idx on public.activities(group_id);
create function public.can_access_activity(a uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.activities where id=a and (group_id is null and owner_id=(select auth.uid()) or group_id is not null and public.is_group_member(group_id)))
$$;
create function public.protect_activity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if new.owner_id <> old.owner_id or new.group_id is distinct from old.group_id then raise exception 'Cannot change activity ownership or scope'; end if;
 end if;
 new.updated_at=now(); return new;
end; $$;
create trigger protect_activity_owner before update on public.activities for each row execute function public.protect_activity();

create table public.occurrences (
 id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.activities(id) on delete cascade,
 owner_id uuid not null references auth.users(id), group_id uuid references public.groups(id) on delete cascade,
 title_override text, starts_at timestamptz, ends_at timestamptz,
 available_from timestamptz, available_until timestamptz,
 ticket_sale_at timestamptz, booking_deadline timestamptz,
 ticket_status text not null default 'none' check(ticket_status in ('none','needed','reserved','purchased')),
 ticket_url text, ticket_count int check(ticket_count between 0 and 100000),
 status text not null default 'proposed' check(status in ('proposed','planned','confirmed','completed','cancelled')),
 visibility text not null default 'normal' check(visibility in ('normal','surprise')),
 repeat_rule text not null default 'none' check(repeat_rule in ('none','weekly','monthly','yearly')),
 actual_cost numeric(10,2) check(actual_cost>=0), rating int check(rating between 1 and 5),
 memory text, created_at timestamptz not null default now(),
 constraint valid_time check(ends_at is null or starts_at is null or ends_at>=starts_at),
 constraint valid_window check(available_until is null or available_from is null or available_until >= available_from)
);
create index occurrences_activity_idx on public.occurrences(activity_id);
create index occurrences_starts_idx on public.occurrences(starts_at);
create function public.occurrence_scope() returns trigger language plpgsql security definer set search_path='' as $$
declare a record;
begin
 select owner_id,group_id into a from public.activities where id=new.activity_id;
 if not found then raise exception 'Missing activity'; end if;
 if tg_op='UPDATE' and new.activity_id<>old.activity_id then raise exception 'Cannot move an occurrence to another idea'; end if;
 new.owner_id=a.owner_id; new.group_id=a.group_id;
 return new;
end; $$;
create trigger set_occurrence_scope before insert or update on public.occurrences for each row execute function public.occurrence_scope();

-- Surprise specifics never appear on public activity/occurrence rows.
create table public.surprise_details (
 occurrence_id uuid primary key references public.occurrences(id) on delete cascade,
 creator_id uuid not null references auth.users(id), true_title text, details text not null default ''
);
create table public.votes (
 activity_id uuid not null references public.activities(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 sentiment text not null check(sentiment in ('love','maybe','pass')),
 primary key(activity_id,user_id)
);
create table public.rsvps (
 occurrence_id uuid not null references public.occurrences(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 response text not null check(response in ('yes','maybe','no')),
 primary key(occurrence_id,user_id)
);
create table public.photos (
 id uuid primary key default gen_random_uuid(), occurrence_id uuid not null references public.occurrences(id) on delete cascade,
 uploaded_by uuid not null references auth.users(id), path text not null unique,
 caption text, created_at timestamptz not null default now()
);
create table public.personal_notes (
 activity_id uuid not null references public.activities(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 note text not null default '', primary key(activity_id,user_id)
);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.activities enable row level security;
alter table public.occurrences enable row level security;
alter table public.surprise_details enable row level security;
alter table public.votes enable row level security;
alter table public.rsvps enable row level security;
alter table public.photos enable row level security;
alter table public.personal_notes enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (
 id=(select auth.uid()) or exists(select 1 from public.memberships mine join public.memberships theirs on mine.group_id=theirs.group_id where mine.user_id=(select auth.uid()) and theirs.user_id=profiles.id)
);
create policy profiles_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy groups_read on public.groups for select to authenticated using(public.is_group_member(id));
create policy groups_create on public.groups for insert to authenticated with check(owner_id=(select auth.uid()));
create policy groups_edit on public.groups for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy groups_delete on public.groups for delete to authenticated using(owner_id=(select auth.uid()));
create policy memberships_read on public.memberships for select to authenticated using(public.is_group_member(group_id));
create policy memberships_remove on public.memberships for delete to authenticated using(user_id=(select auth.uid()) and not public.is_group_owner(group_id) or public.is_group_owner(group_id) and user_id <> (select auth.uid()));
create policy invitations_read on public.invitations for select to authenticated using(public.is_group_owner(group_id));
create policy invitations_create on public.invitations for insert to authenticated with check(public.is_group_owner(group_id) and created_by=(select auth.uid()) and uses=0 and expires_at<=now()+interval '30 days');
create policy invitations_delete on public.invitations for delete to authenticated using(public.is_group_owner(group_id));
create policy activities_read on public.activities for select to authenticated using(group_id is null and owner_id=(select auth.uid()) or group_id is not null and public.is_group_member(group_id));
create policy activities_create on public.activities for insert to authenticated with check(owner_id=(select auth.uid()) and (group_id is null or public.is_group_member(group_id)));
create policy activities_edit on public.activities for update to authenticated using(group_id is null and owner_id=(select auth.uid()) or group_id is not null and public.is_group_member(group_id)) with check(group_id is null and owner_id=(select auth.uid()) or group_id is not null and public.is_group_member(group_id));
create policy activities_delete on public.activities for delete to authenticated using(group_id is null and owner_id=(select auth.uid()) or group_id is not null and public.is_group_member(group_id));
create policy occurrences_read on public.occurrences for select to authenticated using(public.can_access_activity(activity_id));
create policy occurrences_create on public.occurrences for insert to authenticated with check(public.can_access_activity(activity_id));
create policy occurrences_edit on public.occurrences for update to authenticated using(public.can_access_activity(activity_id)) with check(public.can_access_activity(activity_id));
create policy occurrences_delete on public.occurrences for delete to authenticated using(public.can_access_activity(activity_id));
create policy surprise_read on public.surprise_details for select to authenticated using(creator_id=(select auth.uid()));
create policy surprise_create on public.surprise_details for insert to authenticated with check(creator_id=(select auth.uid()) and exists(select 1 from public.occurrences where id=occurrence_id and visibility='surprise' and public.can_access_activity(activity_id)));
create policy surprise_edit on public.surprise_details for update to authenticated using(creator_id=(select auth.uid())) with check(creator_id=(select auth.uid()));
create policy surprise_delete on public.surprise_details for delete to authenticated using(creator_id=(select auth.uid()));
create policy votes_read on public.votes for select to authenticated using(public.can_access_activity(activity_id));
create policy votes_insert on public.votes for insert to authenticated with check(user_id=(select auth.uid()) and public.can_access_activity(activity_id));
create policy votes_update on public.votes for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and public.can_access_activity(activity_id));
create policy votes_delete on public.votes for delete to authenticated using(user_id=(select auth.uid()));
create policy rsvps_read on public.rsvps for select to authenticated using(exists(select 1 from public.occurrences where id=occurrence_id and public.can_access_activity(activity_id)));
create policy rsvps_insert on public.rsvps for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.occurrences where id=occurrence_id and public.can_access_activity(activity_id)));
create policy rsvps_update on public.rsvps for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy rsvps_delete on public.rsvps for delete to authenticated using(user_id=(select auth.uid()));
create policy photos_read on public.photos for select to authenticated using(exists(select 1 from public.occurrences where id=occurrence_id and public.can_access_activity(activity_id)));
create policy photos_insert on public.photos for insert to authenticated with check(uploaded_by=(select auth.uid()) and exists(select 1 from public.occurrences where id=occurrence_id and public.can_access_activity(activity_id)) and path=occurrence_id::text||'/'||uploaded_by::text||'/'||id::text);
create policy photos_delete on public.photos for delete to authenticated using(uploaded_by=(select auth.uid()));
create policy notes_all on public.personal_notes for all to authenticated using(user_id=(select auth.uid()) and public.can_access_activity(activity_id)) with check(user_id=(select auth.uid()) and public.can_access_activity(activity_id));

-- Private photo bucket. Object access verified against the corresponding occurrence.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('memories','memories',false,10485760,array['image/jpeg','image/png','image/webp','image/gif']) on conflict(id) do update set public=false;
create policy memory_objects_read on storage.objects for select to authenticated using(
 bucket_id='memories' and exists(select 1 from public.occurrences o where o.id::text=split_part(name,'/',1) and o.visibility='normal' and public.can_access_activity(o.activity_id))
);
create policy memory_objects_insert on storage.objects for insert to authenticated with check(
 bucket_id='memories' and split_part(name,'/',2)=(select auth.uid())::text and exists(select 1 from public.occurrences o where o.id::text=split_part(name,'/',1) and o.visibility='normal' and public.can_access_activity(o.activity_id))
);
create policy memory_objects_delete on storage.objects for delete to authenticated using(bucket_id='memories' and split_part(name,'/',2)=(select auth.uid())::text);

-- Realtime changes; clients must still enforce their personal/group filters.
alter publication supabase_realtime add table public.activities,public.occurrences,public.votes,public.rsvps;

-- A surprise reservation shows its time to the group, never its payload.
create function public.protect_surprise_occurrence() returns trigger language plpgsql set search_path='' as $$
begin
 if new.visibility='surprise' and (new.title_override is not null or new.memory is not null or new.rating is not null or new.actual_cost is not null or new.ticket_url is not null) then
  raise exception 'Surprise metadata belongs in surprise_details, never in group-visible columns';
 end if;
 return new;
end; $$;
create trigger enforce_surprise before insert or update on public.occurrences for each row execute function public.protect_surprise_occurrence();
-- Photos cannot be associated with concealed plans until made normal.
create function public.photo_not_surprise() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.occurrences where id=new.occurrence_id and visibility='surprise') then raise exception 'Reveal surprise before adding shared photos'; end if;
 return new;
end; $$;
create trigger enforce_photo_visibility before insert or update on public.photos for each row execute function public.photo_not_surprise();

-- Each participant tracks their own reservation independently of group status.
create table public.ticket_claims (
 occurrence_id uuid not null references public.occurrences(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'needed' check(status in ('needed','reserved','purchased')),
 quantity int not null default 1 check(quantity between 0 and 1000),
 updated_at timestamptz not null default now(),
 primary key(occurrence_id,user_id)
);
alter table public.ticket_claims enable row level security;
create policy ticket_claims_read on public.ticket_claims for select to authenticated using(
 exists(select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id))
);
create policy ticket_claims_insert on public.ticket_claims for insert to authenticated with check(
 user_id=(select auth.uid()) and exists(select 1 from public.occurrences o where o.id=occurrence_id and public.can_access_activity(o.activity_id))
);
create policy ticket_claims_update on public.ticket_claims for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy ticket_claims_delete on public.ticket_claims for delete to authenticated using(user_id=(select auth.uid()));
