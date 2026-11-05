-- Run once in Supabase SQL Editor before deploying the activity-flow redesign.
-- These optional fields describe an EVENT, independent of any chosen visit/plan.
-- Existing plans are preserved. Only new location snapshot columns are backfilled; group memberships and RLS policies are unchanged.
alter table public.activities
  add column if not exists event_starts_at timestamptz,
  add column if not exists event_ends_at timestamptz,
  add column if not exists event_available_from timestamptz,
  add column if not exists event_available_until timestamptz,
  add column if not exists event_ticket_sale_at timestamptz,
  add column if not exists event_booking_deadline timestamptz;

-- Plans keep a snapshot of the actual visit location, independent of the idea.
alter table public.occurrences
  add column if not exists visit_location_label text,
  add column if not exists visit_lat double precision,
  add column if not exists visit_lng double precision;

-- Existing plans inherit their activity's location once, preserving it on later edits.
update public.occurrences o
set visit_location_label=a.location_label, visit_lat=a.lat, visit_lng=a.lng
from public.activities a
where o.activity_id=a.id
  and o.visit_location_label is null and o.visit_lat is null and o.visit_lng is null;

-- Event date/window ranges are independent of when a group chooses to visit.
alter table public.activities
  add constraint together_event_range_check check (event_starts_at is null or event_ends_at is null or event_ends_at>=event_starts_at),
  add constraint together_event_window_check check (event_available_from is null or event_available_until is null or event_available_until>=event_available_from);
