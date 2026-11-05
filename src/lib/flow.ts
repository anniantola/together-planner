/** UI-only flow rules; persistence remains in activities and occurrences. */
export type FixedEvent = { event_starts_at?: string|null; event_ends_at?: string|null; event_available_from?: string|null; event_available_until?: string|null; event_ticket_sale_at?:string|null; event_booking_deadline?:string|null }
export type PlanDates = { starts_at?:string|null; ends_at?:string|null; available_from?:string|null; available_until?:string|null; ticket_sale_at?:string|null; booking_deadline?:string|null }
export function validateDateRange(start:string|null|undefined,end:string|null|undefined,label:string):void {
 if(start && end && Date.parse(end)<Date.parse(start)) throw new Error(`${label}: the end cannot be before the start`)
}
export function validateActivityDates(a:FixedEvent):void {
 validateDateRange(a.event_starts_at,a.event_ends_at,'Event date')
 validateDateRange(a.event_available_from,a.event_available_until,'Availability')
}
export function validatePlanDates(p:PlanDates):void {
 validateDateRange(p.starts_at,p.ends_at,'Visit date')
 validateDateRange(p.available_from,p.available_until,'Availability')
}
export function planDatesFromEvent(a:FixedEvent):PlanDates {
 return {
  starts_at:a.event_starts_at||null,
  ends_at:a.event_ends_at||null,
  available_from:a.event_available_from||null,
  available_until:a.event_available_until||null,
  ticket_sale_at:a.event_ticket_sale_at||null,
  booking_deadline:a.event_booking_deadline||null
 }
}
export function draftChanged<T>(current:T|null, original:T|null, pendingCount=0):boolean {
 return pendingCount>0 || JSON.stringify(current)!==JSON.stringify(original)
}
export function isScheduled(status:string):boolean {return status==='planned'||status==='confirmed'}
export function isPastOrToday(value:string|null|undefined,now=Date.now()):boolean {
 return Boolean(value && Number.isFinite(Date.parse(value)) && Date.parse(value)<=now)
}
