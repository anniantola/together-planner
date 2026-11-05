import { format, isAfter, isBefore, parseISO, startOfDay, differenceInCalendarDays, addDays, addMonths, addYears, addWeeks } from 'date-fns'
import type { Activity, Occurrence } from './types'
export function localInput(iso: string|null|undefined) { if (!iso) return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : format(d,"yyyy-MM-dd'T'HH:mm") }
export function asISO(local: string) { if (!local) return null; const d = new Date(local); return Number.isNaN(d.getTime()) ? null : d.toISOString() }
export function when(iso: string|null|undefined) { if (!iso) return 'Unscheduled'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? 'Unknown' : format(d, 'EEE d MMM yyyy, HH:mm') }
export function daysUntil(iso: string) { return differenceInCalendarDays(parseISO(iso), new Date()) }
export function dueItems(occurrences: Occurrence[], activities: Activity[], now = new Date()) {
  const name = new Map(activities.map(a => [a.id,a.title]))
  return occurrences.flatMap(o => {
    if (o.status === 'cancelled' || o.status === 'completed') return []
    const result: { id: string; type: string; title: string; at: string; urgency: number }[] = []
    for (const [key,label,weight] of [['ticket_sale_at','Tickets go on sale',1],['booking_deadline','Booking deadline',0],['available_until','Opportunity ends',2],['starts_at','Coming up',3]] as const) {
      const date = o[key]; if (!date) continue
      const delta = differenceInCalendarDays(parseISO(date), now)
      if (delta < -1 || delta > (key === 'starts_at' ? 14 : 30)) continue
      if (key === 'ticket_sale_at' && o.ticket_status === 'purchased') continue
      if (key === 'booking_deadline' && ['purchased','reserved'].includes(o.ticket_status)) continue
      result.push({ id: o.id, type: label, title: o.visibility === 'surprise' ? 'Surprise plan' : (o.title_override || name.get(o.activity_id) || 'Activity'), at: date, urgency: delta * 10 + weight })
    }
    return result
  }).sort((a,b)=>a.urgency-b.urgency)
}
export function expandOccurrences(occurrences: Occurrence[], from: Date, until: Date): Occurrence[] {
  const all: Occurrence[] = []
  for (const occurrence of occurrences) {
    if (!occurrence.starts_at) continue
    let cursor = parseISO(occurrence.starts_at)
    const original = cursor
    if (isAfter(cursor,until)) continue
    let count = 0
    while (!isAfter(cursor, until) && count++ < 1500) {
      if (!isBefore(cursor,from)) {
        const duration = occurrence.ends_at ? parseISO(occurrence.ends_at).getTime() - original.getTime() : null
        all.push({ ...occurrence, id: count===1 ? occurrence.id : `${occurrence.id}@${count}`, starts_at: cursor.toISOString(), ends_at: duration === null ? null : new Date(cursor.getTime()+duration).toISOString() })
      }
      if (occurrence.repeat_rule === 'none') break
      cursor = occurrence.repeat_rule === 'weekly' ? addWeeks(original,count) : occurrence.repeat_rule === 'monthly' ? addMonths(original,count) : addYears(original,count)
    }
  }
  return all
}
export function calendarDays(center: Date) { const start = startOfDay(new Date(center.getFullYear(),center.getMonth(),1)); const offset = (start.getDay()+6)%7; return Array.from({length:42}, (_,i) => addDays(start,i-offset)) }
export function download(name: string, contents: string, type='application/json') { const blob = new Blob([contents],{type}); const u=URL.createObjectURL(blob); const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000) }
export function makeICS(occurrences: Occurrence[], activities: Activity[]) {
  const names = new Map(activities.map(a=>[a.id,a]))
  const sanitize = (s:string) => s.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/[,;]/g,m=>'\\'+m)
  const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')
  const events=occurrences.filter(o=>o.starts_at&&o.status!=='cancelled').map(o=>{
    const a=names.get(o.activity_id)
    const summary=o.visibility==='surprise'?'Surprise plan':(o.title_override||a?.title||'Activity')
    const lines=['BEGIN:VEVENT',`UID:${o.id}@together-planner`,`DTSTAMP:${utc(new Date().toISOString())}`,`DTSTART:${utc(o.starts_at!)}`,`SUMMARY:${sanitize(summary)}`]
    if(o.ends_at)lines.push(`DTEND:${utc(o.ends_at)}`)
    if(o.repeat_rule!=='none')lines.push(`RRULE:FREQ=${o.repeat_rule.toUpperCase()}`)
    if(o.visibility!=='surprise'&&o.visit_location_label)lines.push(`LOCATION:${sanitize(o.visit_location_label)}`)
    lines.push('END:VEVENT');return lines.join('\r\n')
  })
  const consideredEvents=activities.filter(a=>a.event_starts_at).map(a=>{
    if(occurrences.some(o=>o.activity_id===a.id && ['planned','confirmed'].includes(o.status) && o.starts_at && o.starts_at.slice(0,10)===a.event_starts_at!.slice(0,10)))return null
    const lines=['BEGIN:VEVENT',`UID:event-${a.id}@together-planner`,`DTSTAMP:${utc(new Date().toISOString())}`,`DTSTART:${utc(a.event_starts_at!)}`,`SUMMARY:${sanitize('Event (not booked): '+a.title)}`, 'STATUS:TENTATIVE']
    if(a.event_ends_at)lines.push(`DTEND:${utc(a.event_ends_at)}`)
    if(a.location_label)lines.push(`LOCATION:${sanitize(a.location_label)}`)
    lines.push('END:VEVENT');return lines.join('\r\n')
  }).filter((x):x is string=>Boolean(x))
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Together//Shared Plans//EN',...events,...consideredEvents,'END:VCALENDAR'].join('\r\n')
}
export function safeUrl(url:string|null|undefined) { if (!url) return undefined; try { const u=new URL(url); return ['https:','http:'].includes(u.protocol)?u.href:undefined } catch {return undefined} }
