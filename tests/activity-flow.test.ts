import { describe, expect, it } from 'vitest'
import { draftChanged, isPastOrToday, isScheduled, planDatesFromEvent, validateActivityDates, validatePlanDates } from '../src/lib/flow'

describe('Unified activity → plan → memory workflow',()=>{
 it('separates fixed event timing from the planned visit',()=>{
  const event={event_starts_at:'2026-12-05T18:00:00Z',event_ends_at:'2026-12-05T21:00:00Z',event_available_from:'2026-11-01T09:00:00Z',event_available_until:'2026-12-10T18:00:00Z',event_ticket_sale_at:'2026-11-07T08:00:00Z',event_booking_deadline:'2026-12-02T22:00:00Z'}
  const visit=planDatesFromEvent(event)
  expect(visit.starts_at).toBe(event.event_starts_at)
  expect(visit.ticket_sale_at).toBe(event.event_ticket_sale_at)
  visit.starts_at='2026-12-06T18:00:00Z'
  expect(event.event_starts_at).toBe('2026-12-05T18:00:00Z')
 })
 it('accepts an event availability window with no fixed event date',()=>{
  const event={event_available_from:'2027-01-01T12:00:00Z',event_available_until:'2027-02-01T12:00:00Z'}
  expect(()=>validateActivityDates(event)).not.toThrow()
  expect(planDatesFromEvent(event).starts_at).toBeNull()
 })
 it('rejects backwards fixed events, windows and visit dates',()=>{
  expect(()=>validateActivityDates({event_starts_at:'2027-03-04T18:00:00Z',event_ends_at:'2027-03-04T17:00:00Z'})).toThrow(/event date/i)
  expect(()=>validateActivityDates({event_available_from:'2027-08-01T00:00:00Z',event_available_until:'2027-05-01T00:00:00Z'})).toThrow(/availability/i)
  expect(()=>validatePlanDates({starts_at:'2027-01-02T00:00:00Z',ends_at:'2027-01-01T00:00:00Z'})).toThrow(/visit date/i)
  expect(()=>validatePlanDates({available_from:null,available_until:null})).not.toThrow()
 })
 it('does not treat a proposed event as a scheduled commitment',()=>{
  expect(isScheduled('proposed')).toBe(false)
  expect(isScheduled('planned')).toBe(true)
  expect(isScheduled('confirmed')).toBe(true)
  expect(isScheduled('completed')).toBe(false)
 })
 it('prevents accidental dismissal of edited drafts or selected photos',()=>{
  const original={title:'Cinema',tags:['movie']}
  expect(draftChanged(original,{...original})).toBe(false)
  expect(draftChanged({...original,title:'Theater'},original)).toBe(true)
  expect(draftChanged(original,original,2)).toBe(true)
 })
 it('recognizes dates that are past or today',()=>{
  expect(isPastOrToday('2026-11-05T10:00:00Z',Date.parse('2026-11-05T12:00:00Z'))).toBe(true)
  expect(isPastOrToday('2026-11-06T12:00:00Z',Date.parse('2026-11-05T12:00:00Z'))).toBe(false)
  expect(isPastOrToday(null)).toBe(false)
 })
})

import { makeICS } from '../src/lib/helpers'
import type { Activity, Occurrence } from '../src/lib/types'
describe('Calendar export of event vs visit',()=>{
 const event={id:'event1',title:'Festival',location_label:'Event venue',event_starts_at:'2027-06-07T15:00:00Z'} as Activity
 const visit={id:'visit1',activity_id:'event1',starts_at:'2027-06-08T15:00:00Z',visibility:'normal',status:'planned',repeat_rule:'none',visit_location_label:'Our visit venue'} as Occurrence
 it('includes a fixed event date even without a visit',()=>{
  const ics=makeICS([],[event])
  expect(ics).toContain('UID:event-event1@together-planner')
  expect(ics).toContain('Event (not booked): Festival')
 })
 it('preserves a historical visit location independently of the activity location',()=>{
  const ics=makeICS([visit],[event]);expect(ics).toContain('LOCATION:Our visit venue')
 })
 it('does not duplicate fixed events for a confirmed visit on the same date',()=>{
  const ics=makeICS([{...visit,starts_at:event.event_starts_at,status:'confirmed'}],[event]);expect(ics).not.toContain('UID:event-event1@together-planner')
 })
})
