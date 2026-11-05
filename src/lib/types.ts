export type Group = { id: string; name: string; kind: 'couple'|'friends'|'family'|'custom'; owner_id: string; created_at: string }
export type Membership = { group_id: string; user_id: string; display_name?: string; group?: Group }
export type Activity = {
  id: string; owner_id: string; group_id: string|null; title: string; description: string; category: string;
  tags: string[]; url: string|null; estimated_cost: number|null; duration_minutes: number|null;
  location_label: string|null; lat: number|null; lng: number|null; approximate: boolean;
  season: string|null; weather: string|null; favorite: boolean; created_at: string; updated_at: string
}
export type Occurrence = {
  id: string; activity_id: string; owner_id: string; group_id: string|null;
  title_override: string|null; starts_at: string|null; ends_at: string|null; available_from: string|null;
  available_until: string|null; ticket_sale_at: string|null; booking_deadline: string|null;
  ticket_status: 'none'|'needed'|'reserved'|'purchased'; ticket_url: string|null;
  ticket_count: number|null; status: 'proposed'|'planned'|'confirmed'|'completed'|'cancelled';
  visibility: 'normal'|'surprise'; repeat_rule: 'none'|'weekly'|'monthly'|'yearly';
  actual_cost: number|null; rating: number|null; memory: string|null; created_at: string
}
export type Vote = { activity_id: string; user_id: string; sentiment: 'love'|'maybe'|'pass' }
export type RSVP = { occurrence_id: string; user_id: string; response: 'yes'|'maybe'|'no' }
export type Photo = { id: string; occurrence_id: string; path: string; caption: string|null; uploaded_by: string }
export type Secret = { occurrence_id: string; details: string; true_title: string|null }
export type Scope = { id: string|null; label: string }
export const CATEGORIES = ['Food & drink','Concerts & music','Arts & museums','Outdoors','Travel','At home','Movies & theatre','Sports','Wellness','Learning','Other']

export type IdeaPhoto = {id:string;activity_id:string;path:string;caption:string|null;uploaded_by:string;created_at:string}
export type ExperienceRating = {occurrence_id:string;user_id:string;rating:number;updated_at:string}
export type PersonalFavorite = {activity_id:string;user_id:string;created_at:string}
