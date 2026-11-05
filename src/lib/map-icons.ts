import type { Activity,Occurrence } from './types'
const icon:Record<string,string>={
 'Food & drink':'🍽️','Concerts & music':'🎵','Arts & museums':'🎨','Outdoors':'🌿',
 'Travel':'🧳','At home':'🏡','Movies & theatre':'🎭','Sports':'🏃','Wellness':'🧖','Learning':'📚','Other':'✨'
}
export function activityMarker(a:Pick<Activity,'category'|'id'>, occurrences:Pick<Occurrence,'activity_id'|'status'|'starts_at'>[]):string {
 const related=occurrences.filter(o=>o.activity_id===a.id)
 const status=related.some(o=>o.status==='completed')?'visited':related.some(o=>o.status!=='cancelled'&&o.starts_at)?'planned':'idea'
 const symbol=icon[a.category]||icon.Other
 const badge=status==='visited'?'✓':status==='planned'?'●':'+';
 return `<span class="together-map-pin ${status}" aria-label="${status}"><span class="pin-symbol">${symbol}</span><span class="pin-badge">${badge}</span></span>`
}
