import { describe,it,expect } from 'vitest'
import { dueItems, expandOccurrences, makeICS, safeUrl } from '../src/lib/helpers'
import type { Activity, Occurrence } from '../src/lib/types'
const activity={id:'a',title:'Cinema'} as Activity
const occurrence={ id:'o', activity_id:'a', status:'planned', visibility:'normal', ticket_status:'needed', repeat_rule:'none' } as Occurrence
describe('planning utilities',()=>{
 it('protects unsafe URLs',()=>{expect(safeUrl('javascript:alert(1)')).toBeUndefined();expect(safeUrl('https://example.com')).toBe('https://example.com/')})
 it('excludes completed from alerts',()=>{expect(dueItems([{...occurrence,status:'completed',booking_deadline:new Date().toISOString()}],[activity])).toEqual([])})
 it('removes surprise details from calendar exports',()=>{ const ics=makeICS([{...occurrence,visibility:'surprise',starts_at:'2026-12-01T10:00:00Z'}],[activity]);expect(ics).toContain('Surprise plan');expect(ics).not.toContain('Cinema') })
 it('exports recurring plans as a calendar series',()=>{const ics=makeICS([{...occurrence,starts_at:'2026-12-01T10:00:00Z',repeat_rule:'yearly'}],[activity]);expect(ics).toContain('RRULE:FREQ=YEARLY')})
 it('expands recurring dates',()=>{const events=expandOccurrences([{...occurrence,starts_at:'2026-01-05T10:00:00Z',repeat_rule:'weekly'}],new Date('2026-01-01'),new Date('2026-01-31'));expect(events).toHaveLength(4)})
})
