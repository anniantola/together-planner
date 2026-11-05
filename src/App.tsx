import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { addDays, addMonths, addWeeks, endOfMonth, format, isSameDay, startOfMonth, subMonths, subWeeks } from 'date-fns'
import { CalendarDays, Heart, Lightbulb, MapPinned, BookHeart, Users, Settings, Plus, Bell, Ticket, Shuffle, Menu, X, Share2, Trash2, Edit3, Download, ChevronLeft, ChevronRight, LockKeyhole } from 'lucide-react'
import type { Activity, Occurrence, Group, Membership, Vote, RSVP, Photo, IdeaPhoto, ExperienceRating, PersonalFavorite, Secret } from './lib/types'
import { CATEGORIES } from './lib/types'
import { configured, supabase, assertOk } from './lib/supabase'
import { friendlyAuthError } from './lib/auth-errors'
import { asISO, calendarDays, daysUntil, download, dueItems, expandOccurrences, localInput, makeICS, safeUrl, when } from './lib/helpers'
import ActivityMap from './components/ActivityMap'
import PlaceSearch from './components/PlaceSearch'
import PhotoUpload from './components/PhotoUpload'
import { checkImage } from './lib/photo-utils'
import type { PlaceResult } from './lib/place-search'
import type { User } from '@supabase/supabase-js'

type Tab = 'Home'|'Calendar'|'Ideas'|'Map'|'Memories'|'Groups'|'Settings'
type Editable = Partial<Activity> & { id?:string }
const icon: Record<Tab,typeof Heart>={Home:Heart,Calendar:CalendarDays,Ideas:Lightbulb,Map:MapPinned,Memories:BookHeart,Groups:Users,Settings:Settings}
const tabs:Tab[]=['Home','Calendar','Ideas','Map','Memories','Groups','Settings']
const BLANK_IDEA:Editable={title:'',description:'',category:'Food & drink',tags:[],url:null,estimated_cost:null,duration_minutes:null,location_label:null,lat:null,lng:null,approximate:false,season:null,weather:null,favorite:false,group_id:null}
const BLANK_EVENT:Partial<Occurrence>={starts_at:null,ends_at:null,available_from:null,available_until:null,ticket_sale_at:null,booking_deadline:null,ticket_status:'none',ticket_url:null,ticket_count:null,status:'proposed',visibility:'normal',repeat_rule:'none',actual_cost:null,rating:null,memory:null,title_override:null}
function uid() {return crypto.randomUUID()}
function errmsg(e:unknown) {return e instanceof Error ? e.message : String(e)}
function Key({children}: {children:ReactNode}) {return <span className="chip">{children}</span>}
function Modal({title,onClose,children}: {title:string;onClose:()=>void;children:ReactNode}) {useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[onClose]);return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><h2>{title}</h2><button aria-label="Close" className="icon-button" onClick={onClose}><X/></button></header>{children}</section></div>}
function Field({label,children}: {label:string;children:ReactNode}) {return <label className="field"><span>{label}</span>{children}</label>}
function DateField({label,value,onChange}: {label:string;value?:string|null;onChange:(iso:string|null)=>void}) {return <Field label={label}><input type="datetime-local" value={localInput(value)} onChange={e=>onChange(asISO(e.target.value))}/></Field>}
function goUrl(url?:string|null) {const u=safeUrl(url); if(u)window.open(u,'_blank','noopener,noreferrer')}

export default function App() {
 const [scopeLoaded,setScopeLoaded]=useState(false)
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [groups,setGroups]=useState<Group[]>([]),[members,setMembers]=useState<Membership[]>([]),[activities,setActivities]=useState<Activity[]>([]),[occurrences,setOccurrences]=useState<Occurrence[]>([]),[votes,setVotes]=useState<Vote[]>([]),[rsvps,setRsvps]=useState<RSVP[]>([]),[photos,setPhotos]=useState<Photo[]>([]),[secrets,setSecrets]=useState<Secret[]>([])
 const [ideaPhotos,setIdeaPhotos]=useState<IdeaPhoto[]>([]),[personalFavorites,setPersonalFavorites]=useState<PersonalFavorite[]>([]),[ratings,setRatings]=useState<ExperienceRating[]>([])
 const [onlyFavorites,setOnlyFavorites]=useState(false),[mapFocus,setMapFocus]=useState<PlaceResult|null>(null)
 const [tab,setTab]=useState<Tab>('Home'),[scope,setScope]=useState<string>('all'),[visibleScopes,setVisibleScopes]=useState<string[]>(()=>{try {return JSON.parse(localStorage.getItem('together-scopes')||'["personal"]')}catch{return ['personal']}})
 const [idea,setIdea]=useState<Editable|null>(null),[event,setEvent]=useState<Partial<Occurrence>|null>(null),[eventActivity,setEventActivity]=useState<string>(''),[detail,setDetail]=useState<Activity|null>(null),[selectedOccurrence,setSelectedOccurrence]=useState<Occurrence|null>(null)
 const [ticketClaims,setTicketClaims]=useState<{occurrence_id:string;user_id:string;status:'needed'|'reserved'|'purchased';quantity:number}[]>([])
 const [invitations,setInvitations]=useState<{id:string;group_id:string;code:string;expires_at:string;uses:number;max_uses:number}[]>([])
 const [profiles,setProfiles]=useState<{id:string;display_name:string}[]>([])
 const [jarOpen,setJarOpen]=useState(false),[jarBudget,setJarBudget]=useState(''),[jarDuration,setJarDuration]=useState(''),[jarWeather,setJarWeather]=useState('Any'),[jarUntried,setJarUntried]=useState(true)
 const [notes,setNotes]=useState<{activity_id:string;user_id:string;note:string}[]>([])
 const [noteDraft,setNoteDraft]=useState('')
 const [groupModal,setGroupModal]=useState(false),[inviteModal,setInviteModal]=useState(false),[joinCode,setJoinCode]=useState(''),[inviteCode,setInviteCode]=useState(''),[calendarCenter,setCalendarCenter]=useState(new Date()),[calendarView,setCalendarView]=useState<'month'|'week'|'agenda'>('month')
 const [newPassword,setNewPassword]=useState('')
 const [categoryFilter,setCategoryFilter]=useState('All'),[search,setSearch]=useState(''),[mapStatus,setMapStatus]=useState('all'),[showScopes,setShowScopes]=useState(false),[personalName,setPersonalName]=useState(''),[dark,setDark]=useState(()=>localStorage.getItem('together-theme')!=='light'),[notifications,setNotifications]=useState(false)
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('together-theme',dark?'dark':'light')},[dark])
 useEffect(()=>{if(scopeLoaded)localStorage.setItem('together-scopes',JSON.stringify(visibleScopes))},[visibleScopes,scopeLoaded])
 const fetchData=useCallback(async()=>{
   if(!user)return
   const requests=await Promise.all([
     supabase.from('groups').select('*').order('created_at'),supabase.from('memberships').select('*'),supabase.from('activities').select('*').order('created_at',{ascending:false}),supabase.from('occurrences').select('*').order('created_at',{ascending:false}),supabase.from('votes').select('*'),supabase.from('rsvps').select('*'),supabase.from('photos').select('*'),supabase.from('surprise_details').select('*'),supabase.from('profiles').select('*').eq('id',user.id).maybeSingle(),supabase.from('personal_notes').select('*'),supabase.from('profiles').select('id,display_name'),supabase.from('ticket_claims').select('*'),supabase.from('invitations').select('*'),supabase.from('idea_photos').select('*'),supabase.from('activity_favorites').select('*'),supabase.from('experience_ratings').select('*')
   ])
   for(const r of requests) assertOk(r.error)
   setGroups((requests[0].data||[]) as Group[]);setMembers((requests[1].data||[]) as Membership[])
   setActivities((requests[2].data||[]) as Activity[]);setOccurrences((requests[3].data||[]) as Occurrence[])
   setVotes((requests[4].data||[]) as Vote[]);setRsvps((requests[5].data||[]) as RSVP[])
   setPhotos((requests[6].data||[]) as Photo[]);setSecrets((requests[7].data||[]) as Secret[])
   setPersonalName((requests[8].data as {display_name?:string}|null)?.display_name||'');setNotes(requests[9].data||[]);setProfiles(requests[10].data||[]);setTicketClaims(requests[11].data||[]);setInvitations(requests[12].data||[]);setIdeaPhotos((requests[13].data||[]) as IdeaPhoto[]);setPersonalFavorites((requests[14].data||[]) as PersonalFavorite[]);setRatings((requests[15].data||[]) as ExperienceRating[])
 },[user])
 useEffect(()=>{supabase.auth.getUser().then(({data})=>{setUser(data.user);setLoading(false)}).catch(e=>{setError(errmsg(e));setLoading(false)});const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{setUser(s?.user||null);if(event==='PASSWORD_RECOVERY'){setTab('Settings');setNotice('Password recovery verified. Set a new password in Settings.')}});return()=>subscription.unsubscribe()},[])
 useEffect(()=>{if(!user)return;let alive=true;setLoading(true);fetchData().catch(e=>{if(alive)setError(errmsg(e))}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[user,fetchData])
 useEffect(()=>{if(!user)return;const channel=supabase.channel('together-updates').on('postgres_changes',{event:'*',schema:'public',table:'activities'},()=>void fetchData()).on('postgres_changes',{event:'*',schema:'public',table:'occurrences'},()=>void fetchData()).on('postgres_changes',{event:'*',schema:'public',table:'votes'},()=>void fetchData()).on('postgres_changes',{event:'*',schema:'public',table:'rsvps'},()=>void fetchData()).on('postgres_changes',{event:'*',schema:'public',table:'idea_photos'},()=>void fetchData()).on('postgres_changes',{event:'*',schema:'public',table:'activity_favorites'},()=>void fetchData()).on('postgres_changes',{event:'*',schema:'public',table:'experience_ratings'},()=>void fetchData()).on('postgres_changes',{event:'*',schema:'public',table:'photos'},()=>void fetchData()).subscribe();return()=>{void supabase.removeChannel(channel)}},[user,fetchData])
 const scopeInit=useRef(false)
 useEffect(()=>{if(!user||loading||scopeInit.current)return;scopeInit.current=true;const saved=localStorage.getItem('together-scopes');if(!saved)setVisibleScopes(['personal',...groups.map(g=>g.id)]);setScopeLoaded(true)},[user,loading,groups])
 async function act(task:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await task();await fetchData()}catch(e){setError(errmsg(e))}finally{setBusy(false)}}
 function isVisible(groupId:string|null,view:'calendar'|'list'='list') {return view==='calendar'?visibleScopes.includes(groupId||'personal'):scope==='all'||(scope==='personal'?groupId===null:groupId===scope)}
 const scopedActivities=activities.filter(a=>isVisible(a.group_id))
 const visibleActivities=activities.filter(a=>isVisible(a.group_id,'calendar'))
 const visibleIds=new Set(visibleActivities.map(a=>a.id))
 const visibleOccurrences=occurrences.filter(o=>visibleIds.has(o.activity_id))
 const byId=new Map(activities.map(a=>[a.id,a]))
 const urgent=dueItems(visibleOccurrences,visibleActivities).filter(d=>{const claim=ticketClaims.find(t=>t.occurrence_id===d.id&&t.user_id===user?.id);return !(['Tickets go on sale','Booking deadline'].includes(d.type)&&claim&&['reserved','purchased'].includes(claim.status))}).slice(0,12)
 const urgentSignature=urgent.map(x=>x.id+':'+x.type+':'+x.at).join('|')
 useEffect(()=>{
  if(!notifications||!('Notification' in window)||Notification.permission!=='granted')return
  function notify(){
   const today=format(new Date(),'yyyy-MM-dd')
   for(const u of urgent){
    if(daysUntil(u.at)<0||daysUntil(u.at)>1)continue
    const key=`together-alert-${u.id}-${u.type}-${today}`
    if(localStorage.getItem(key))continue
    try{new Notification('Together · Plan reminder',{body:'Something needs your attention. Open Together to review.'});localStorage.setItem(key,'1')}catch{/* browser may block notifications */}
   }
  }
  notify();const interval=window.setInterval(notify,60*60*1000)
  return()=>window.clearInterval(interval)
 // urgentSignature fixes notification re-creation when unrelated state changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[notifications,urgentSignature])
 const planned=visibleOccurrences.filter(o=>o.starts_at&&new Date(o.starts_at)>=new Date()&&o.status!=='cancelled'&&o.status!=='completed').sort((a,b)=>oDate(a)-oDate(b))
 const onThisDay=visibleOccurrences.filter(o=>o.status==='completed'&&o.starts_at&&new Date(o.starts_at).getMonth()===new Date().getMonth()&&new Date(o.starts_at).getDate()===new Date().getDate()&&new Date(o.starts_at).getFullYear()<new Date().getFullYear())
 const completed=visibleOccurrences.filter(o=>o.status==='completed').sort((a,b)=>oDate(b)-oDate(a))
 const scopeOptions=[{id:'personal',label:'🔒 My Space'},...groups.map(g=>({id:g.id,label:groupLabel(g)}))]
 const activityName=(o:Occurrence)=>o.visibility==='surprise'?(secrets.find(s=>s.occurrence_id===o.id)?.true_title||'🎁 Surprise plan'):(o.title_override||byId.get(o.activity_id)?.title||'Activity')
 const myVote=(a:Activity)=>votes.find(v=>v.activity_id===a.id&&v.user_id===user?.id)?.sentiment
 const isFavorite=(a:Activity)=>personalFavorites.some(f=>f.activity_id===a.id&&f.user_id===user?.id)
 const experienceRatings=(o:Occurrence)=>ratings.filter(r=>r.occurrence_id===o.id)
 const myRating=(o:Occurrence)=>experienceRatings(o).find(r=>r.user_id===user?.id)?.rating
 const meanRating=(o:Occurrence)=>{const r=experienceRatings(o);return r.length?(r.reduce((n,x)=>n+x.rating,0)/r.length).toFixed(1):null}
 const onPlaceFound=(p:PlaceResult)=>setIdea(prev=>prev?{...prev,location_label:p.label,lat:p.lat,lng:p.lng,approximate:false}:prev)
 const myRsvp=(o:Occurrence)=>rsvps.find(r=>r.occurrence_id===o.id&&r.user_id===user?.id)?.response
 function openEvent(a?:Activity,date?:Date) {setEventActivity(a?.id||'');setEvent({...BLANK_EVENT,starts_at:date?date.toISOString():null});setDetail(null)}
 function openDetail(a:Activity) {setDetail(a);setNoteDraft(notes.find(n=>n.activity_id===a.id&&n.user_id===user?.id)?.note||'');setTab('Ideas')}
 async function saveIdea(e:FormEvent){e.preventDefault();if(!user||!idea?.title?.trim())return;await act(async()=>{
  const {id,created_at,updated_at,...fields}=idea;void created_at;void updated_at
  const payload={...fields,title:idea.title!.trim(),owner_id:idea.owner_id||user.id,group_id:idea.group_id??null,tags:idea.tags||[]}
  if(id)assertOk((await supabase.from('activities').update(payload).eq('id',id)).error)
  else assertOk((await supabase.from('activities').insert(payload)).error)
  setIdea(null);setNotice('Idea saved')
 })}
 async function saveOccurrence(e:FormEvent){e.preventDefault();if(!user||!eventActivity||!event)return;await act(async()=>{
  const {id,activity_id,created_at,owner_id,group_id,...fields}=event;void activity_id;void created_at;void owner_id;void group_id
  if(fields.ends_at&&fields.starts_at&&fields.ends_at<fields.starts_at)throw new Error('End time cannot precede start time')
  if(fields.visibility==='surprise'){fields.title_override=null;fields.memory=null;fields.rating=null;fields.actual_cost=null;fields.ticket_url=null}
  const payload={...fields,activity_id:eventActivity};delete payload.rating
  let savedId=id
  if(id)assertOk((await supabase.from('occurrences').update(payload).eq('id',id)).error)
  else {const result=await supabase.from('occurrences').insert(payload).select('id').single();assertOk(result.error);savedId=result.data!.id}
  if(fields.visibility==='surprise'&&savedId&&eventSecret) {assertOk((await supabase.from('surprise_details').upsert({occurrence_id:savedId,creator_id:user.id,true_title:eventSecret.title,details:eventSecret.details})).error)}
  setEvent(null);setEventSecret(null);setNotice('Plan saved')
 })}
 const [eventSecret,setEventSecret]=useState<{title:string;details:string}|null>(null)
 async function removeActivity(a:Activity){if(!confirm(`Delete "${a.title}" and all linked plans, memories and photos? This cannot be undone.`))return;await act(async()=>{assertOk((await supabase.from('activities').delete().eq('id',a.id)).error);setDetail(null)})}
 async function removeOccurrence(o:Occurrence){if(!confirm('Delete this plan and its memories permanently?'))return;await act(async()=>{assertOk((await supabase.from('occurrences').delete().eq('id',o.id)).error);setSelectedOccurrence(null)})}
 async function claimTicket(o:Occurrence,status:'needed'|'reserved'|'purchased'){if(!user)return;await act(async()=>{assertOk((await supabase.from('ticket_claims').upsert({occurrence_id:o.id,user_id:user.id,status,quantity:1})).error)})}
 async function vote(a:Activity,sentiment:'love'|'maybe'|'pass'){if(!user)return;await act(async()=>{
  if(myVote(a)===sentiment)assertOk((await supabase.from('votes').delete().eq('activity_id',a.id).eq('user_id',user.id)).error)
  else assertOk((await supabase.from('votes').upsert({activity_id:a.id,user_id:user.id,sentiment})).error)
 })}
 async function toggleFavorite(a:Activity){if(!user)return;await act(async()=>{
  if(isFavorite(a))assertOk((await supabase.from('activity_favorites').delete().eq('activity_id',a.id).eq('user_id',user.id)).error)
  else assertOk((await supabase.from('activity_favorites').insert({activity_id:a.id,user_id:user.id})).error)
 })}
 async function rateExperience(o:Occurrence,value:number|null){if(!user)return;await act(async()=>{
  if(value===null)assertOk((await supabase.from('experience_ratings').delete().eq('occurrence_id',o.id).eq('user_id',user.id)).error)
  else assertOk((await supabase.from('experience_ratings').upsert({occurrence_id:o.id,user_id:user.id,rating:value,updated_at:new Date().toISOString()})).error)
 })}
 async function rsvp(o:Occurrence,response:'yes'|'maybe'|'no'){if(!user)return;await act(async()=>{assertOk((await supabase.from('rsvps').upsert({occurrence_id:o.id,user_id:user.id,response})).error)})}
 async function share(a:Activity,groupId:string|null){if(!user)return;await act(async()=>{
  const {id,created_at,updated_at,owner_id,...copy}=a;void id;void created_at;void updated_at;void owner_id
  assertOk((await supabase.from('activities').insert({...copy,group_id:groupId,owner_id:user.id})).error)
  setNotice('Shared as a new idea. Private notes, votes, plans and memories were not copied.')
 })}
 async function saveNote(a:Activity){if(!user)return;await act(async()=>{assertOk((await supabase.from('personal_notes').upsert({activity_id:a.id,user_id:user.id,note:noteDraft})).error);setNotice('Private note saved')})}
 async function uploadMedia(kind:'idea'|'memory',parentId:string,file:File,caption:string){
  if(!user)throw new Error('Sign in first')
  const invalid=checkImage(file);if(invalid)throw new Error(invalid)
  const id=uid(),path=kind==='idea'?`ideas/${parentId}/${user.id}/${id}`:`${parentId}/${user.id}/${id}`
  const result=await supabase.storage.from('memories').upload(path,file,{contentType:file.type,upsert:false});assertOk(result.error)
  const db=kind==='idea'
   ?await supabase.from('idea_photos').insert({id,activity_id:parentId,uploaded_by:user.id,path,caption:caption||null})
   :await supabase.from('photos').insert({id,occurrence_id:parentId,uploaded_by:user.id,path,caption:caption||null})
  if(db.error){await supabase.storage.from('memories').remove([path]);assertOk(db.error)}
 }
 async function removePhoto(p:Photo|IdeaPhoto,kind:'idea'|'memory'){if(!user||p.uploaded_by!==user.id)return;if(!confirm('Delete this photo?'))return;await act(async()=>{
  assertOk((await supabase.storage.from('memories').remove([p.path])).error)
  assertOk((await supabase.from(kind==='idea'?'idea_photos':'photos').delete().eq('id',p.id)).error)
 })}
 async function changePhotoCaption(p:Photo|IdeaPhoto,kind:'idea'|'memory',caption:string){if(!user||p.uploaded_by!==user.id)return;await act(async()=>{
  assertOk((await supabase.from(kind==='idea'?'idea_photos':'photos').update({caption:caption.slice(0,300)||null}).eq('id',p.id)).error)
 })}
 async function createGroup(name:string,kind:Group['kind']){if(!user)return;await act(async()=>{assertOk((await supabase.from('groups').insert({name,kind,owner_id:user.id})).error);setGroupModal(false);setNotice('Group created')})}
 async function invite(g:Group){if(!user)return;await act(async()=>{
  const code=Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('')
  assertOk((await supabase.from('invitations').insert({group_id:g.id,created_by:user.id,code})).error);setInviteCode(code);setInviteModal(true)
 })}
 async function join(){await act(async()=>{const code=joinCode.trim();const {error:e}=await supabase.rpc('accept_invitation',{invite_code:code});assertOk(e);setJoinCode('');setNotice('You joined the group')})}
 async function removeMember(g:Group,m:Membership){if(!confirm('Remove this member from the group?'))return;await act(async()=>{assertOk((await supabase.from('memberships').delete().eq('group_id',g.id).eq('user_id',m.user_id)).error)})}
 async function saveProfile(){if(!user)return;await act(async()=>{assertOk((await supabase.from('profiles').update({display_name:personalName.trim()||'Someone'}).eq('id',user.id)).error);setNotice('Profile updated')})}
 function exportData(){download('together-backup-'+format(new Date(),'yyyy-MM-dd')+'.json',JSON.stringify({exportedAt:new Date().toISOString(),version:1,groups,activities,occurrences,votes,rsvps,photos:photos.map(p=>({...p,note:'Photo files are not included in JSON backup'})),personal_notes:notes,secrets,personal_favorites:personalFavorites,experience_ratings:ratings,idea_photos:ideaPhotos.map(p=>({...p,note:'Photo files not included'}))},null,2))}
 async function importPersonal(file:File){await act(async()=>{if(!user)return;const raw=JSON.parse(await file.text());if(!Array.isArray(raw.activities))throw new Error('Not a Together backup');let count=0;for(const a of raw.activities.slice(0,500)){
  if(!a||typeof a!=='object'||typeof a.title!=='string'||!a.title.trim())continue
  const payload={owner_id:user.id,group_id:null,title:a.title.slice(0,180),description:String(a.description||''),category:String(a.category||'Other'),tags:Array.isArray(a.tags)?a.tags.filter((t:unknown)=>typeof t==='string').slice(0,30):[],url:safeUrl(a.url)||null,estimated_cost:typeof a.estimated_cost==='number'?a.estimated_cost:null,duration_minutes:Number.isInteger(a.duration_minutes)?a.duration_minutes:null,location_label:typeof a.location_label==='string'?a.location_label:null,lat:typeof a.lat==='number'?a.lat:null,lng:typeof a.lng==='number'?a.lng:null,approximate:Boolean(a.approximate),season:typeof a.season==='string'?a.season:null,weather:typeof a.weather==='string'?a.weather:null,favorite:false}
  const inserted=await supabase.from('activities').insert(payload).select('id').single();assertOk(inserted.error)
  const wasFavorite=Boolean(a.favorite)||(Array.isArray(raw.personal_favorites)&&raw.personal_favorites.some((f:{activity_id?:string}|null)=>f?.activity_id===a.id))
  if(wasFavorite)assertOk((await supabase.from('activity_favorites').insert({activity_id:inserted.data!.id,user_id:user.id})).error)
  count++
 }setNotice(`Imported ${count} ideas to My Space. Shared data and private notes were not imported.`)})}
 async function extractURL(url:string){if(!safeUrl(url)){setError('Please use a valid http(s) link');return}setBusy(true);setError('');try{const {data,error:e}=await supabase.functions.invoke('import-event',{body:{url}});assertOk(e);if(data?.error)throw new Error(data.error);setIdea(p=>p?{...p,title:p.title||data.title||'',description:p.description||data.description||'',location_label:p.location_label||data.location||null,url}:p);setNotice('Website details suggested. Check them before saving.')}catch(e){setError('Could not extract this website: '+errmsg(e))}finally{setBusy(false)}}
 const searchActivities=scopedActivities.filter(a=>(!onlyFavorites||isFavorite(a))&&(categoryFilter==='All'||a.category===categoryFilter)&&`${a.title} ${a.description} ${a.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()))
 const mapActivities=visibleActivities.filter(a=>mapStatus==='all'||(mapStatus==='favourites'?isFavorite(a):mapStatus==='completed'?occurrences.some(o=>o.activity_id===a.id&&o.status==='completed'):mapStatus==='upcoming'?occurrences.some(o=>o.activity_id===a.id&&o.starts_at&&o.status!=='completed'&&o.status!=='cancelled'):!occurrences.some(o=>o.activity_id===a.id)))
 function surpriseSafe(o:Occurrence){return o.visibility==='surprise'&&!secrets.some(s=>s.occurrence_id===o.id)}
 const calendarEvents=expandOccurrences(visibleOccurrences,addMonths(calendarCenter,-2),addMonths(calendarCenter,2))
 if(!configured)return <div className="setup"><Heart size={36}/><h1>Together</h1><p>The app is ready to connect to your private Supabase project.</p><p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your GitHub repository variables or local <code>.env.local</code>. Follow README.md for database setup.</p></div>
 if(loading&&!user)return <div className="setup">Loading Together…</div>
 if(!user)return <Auth/>
 return <div className="app"><aside className="sidebar"><div className="brand"><Heart size={25} fill="currentColor"/><div><b>Together</b><small>Make time for memories</small></div></div><nav aria-label="Main navigation">{tabs.map(t=>{const Icon=icon[t];return <button key={t} className={'nav-item '+(tab===t?'active':'')} onClick={()=>setTab(t)}><Icon size={20}/><span>{t}</span></button>})}</nav><div className="side-bottom"><span>Private by default</span><LockKeyhole size={16}/></div></aside>
 <div className="main"><header className="topbar"><div><div className="eyebrow">YOUR SHARED WORLD</div><h1>{tab}</h1></div><div className="top-actions"><button className="icon-button" title="Select visible groups" onClick={()=>setShowScopes(!showScopes)}><Menu/></button><button className="primary" onClick={()=>setIdea({...BLANK_IDEA,group_id:scope==='all'||scope==='personal'?null:scope})}><Plus size={18}/> Add idea</button></div></header>
 {showScopes&&<section className="filter-panel"><h3>Calendar, Home, Map & Memories visibility</h3><div className="row wrap">{scopeOptions.map(s=><label className="toggle" key={s.id}><input type="checkbox" checked={visibleScopes.includes(s.id)} onChange={()=>setVisibleScopes(p=>p.includes(s.id)?p.filter(x=>x!==s.id):[...p,s.id])}/>{s.label}</label>)}</div><button className="ghost" onClick={()=>setVisibleScopes(scopeOptions.map(s=>s.id))}>Show all</button></section>}
 {error&&<div className="alert error" role="alert">{error} <button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></div>}{notice&&<div className="alert success" role="status">{notice} <button aria-label="Dismiss notice" onClick={()=>setNotice('')}>×</button></div>}
 {loading&&<div className="muted">Refreshing…</div>}
 {tab==='Home'&&<div className="page-grid"><section className="hero"><div className="eyebrow">THE GOOD STUFF IS AHEAD</div><h2>Make something happen.</h2><p>Save ideas, plan meaningful time together, and keep the memories.</p><div className="row wrap"><button className="primary" onClick={()=>setIdea({...BLANK_IDEA})}><Plus size={17}/> Save an idea</button><button className="secondary" onClick={()=>setJarOpen(true)}><Shuffle size={17}/> Date Jar</button></div></section>
 <section className="panel"><div className="section-header"><h2><Bell size={19}/> Needs attention</h2><Key>{urgent.length}</Key></div>{urgent.length?urgent.map((d,i)=><button key={d.id+d.type+i} className="item action-row" onClick={()=>setSelectedOccurrence(occurrences.find(o=>o.id===d.id)||null)}><span className="round-icon"><Ticket size={18}/></span><span className="grow"><strong>{d.title}</strong><small>{d.type} · {when(d.at)}</small></span><span className="pill">{daysUntil(d.at)<0?'Overdue':daysUntil(d.at)===0?'Today':`In ${daysUntil(d.at)}d`}</span></button>):<p className="empty">Nothing urgent right now. You're all caught up.</p>}</section>
 <section className="panel"><div className="section-header"><h2><CalendarDays size={19}/> Coming up</h2><button className="link" onClick={()=>setTab('Calendar')}>Calendar →</button></div>{planned.length?planned.slice(0,5).map(o=><button className="item action-row" key={o.id} onClick={()=>setSelectedOccurrence(o)}><span className="date-box">{format(new Date(o.starts_at!), 'd')}<small>{format(new Date(o.starts_at!), 'MMM')}</small></span><span className="grow"><strong>{activityName(o)}</strong><small>{when(o.starts_at)} · {o.status}</small></span></button>):<p className="empty">No upcoming plans yet.</p>}</section>
 <section className="panel"><div className="section-header"><h2><Lightbulb size={19}/> Ideas waiting for you</h2><button className="link" onClick={()=>setTab('Ideas')}>All ideas →</button></div>{visibleActivities.filter(a=>!occurrences.some(o=>o.activity_id===a.id)).slice(0,5).map(a=><button key={a.id} className="item action-row" onClick={()=>openDetail(a)}><span className="round-icon"><Lightbulb size={18}/></span><span className="grow"><strong>{a.title}</strong><small>{a.category} · {a.location_label||'Anywhere'}</small></span></button>)}{!visibleActivities.some(a=>!occurrences.some(o=>o.activity_id===a.id))&&<p className="empty">Add ideas for your next adventure.</p>}</section>
 <section className="panel"><div className="section-header"><h2><BookHeart size={19}/> Recent memories</h2><button className="link" onClick={()=>setTab('Memories')}>Memories →</button></div>{completed.slice(0,4).map(o=><button className="item action-row" key={o.id} onClick={()=>setSelectedOccurrence(o)}><span className="round-icon"><Heart size={18}/></span><span className="grow"><strong>{activityName(o)}</strong><small>{when(o.starts_at)} {meanRating(o)?`· ⭐ ${meanRating(o)} (${experienceRatings(o).length})`:''}</small></span></button>)}{completed.length===0&&<p className="empty">Your favourite stories will live here.</p>}</section>{onThisDay.length>0&&<section className="panel"><h2>❤️ On this day</h2>{onThisDay.map(o=><button className="item action-row" key={o.id} onClick={()=>setSelectedOccurrence(o)}><strong>{activityName(o)}</strong><small>{format(new Date(o.starts_at!),'yyyy')}</small></button>)}</section>}</div>}
 {tab==='Ideas'&&<section className="page"><div className="toolbar"><select aria-label="Idea group" value={scope} onChange={e=>setScope(e.target.value)}><option value="all">All my spaces</option><option value="personal">🔒 My Space</option>{groups.map(g=><option key={g.id} value={g.id}>{groupLabel(g)}</option>)}</select><input aria-label="Search ideas" placeholder="Search ideas…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Category" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option>All</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select><label className="toggle"><input type="checkbox" checked={onlyFavorites} onChange={e=>setOnlyFavorites(e.target.checked)}/> ★ My favourites</label><button className="secondary" onClick={()=>setJarOpen(true)}><Shuffle size={17}/> Date Jar</button></div><div className="cards">{searchActivities.map(a=><article className="idea-card" key={a.id}><div className="row space"><Key>{a.category}</Key><span title={a.group_id?'Shared with a group':'Private'}>{a.group_id?'👥':'🔒'}</span></div><h3>{a.title}</h3>{ideaPhotos.some(p=>p.activity_id===a.id)&&<PhotoStrip photos={ideaPhotos.filter(p=>p.activity_id===a.id).slice(0,1)} compact/>}<p>{a.description||'A little adventure waiting to happen.'}</p><div className="mini-details">{a.location_label&&<span>📍 {a.location_label}</span>}{a.estimated_cost!==null&&<span>€{a.estimated_cost}</span>}{a.duration_minutes&&<span>⏱ {a.duration_minutes} min</span>}</div><div className="row wrap"><button className="secondary compact" onClick={()=>openDetail(a)}>Details</button><button className="ghost compact" onClick={()=>openEvent(a)}>+ Plan</button><button className="ghost compact" disabled={busy} onClick={()=>vote(a,'love')} aria-pressed={myVote(a)==='love'} aria-label="Love idea (tap again to remove)">{myVote(a)==='love'?'❤️':'♡'} {votes.filter(v=>v.activity_id===a.id&&v.sentiment==='love').length}</button><button className="ghost compact" disabled={busy} onClick={()=>toggleFavorite(a)} aria-pressed={isFavorite(a)} aria-label={isFavorite(a)?'Remove my favourite':'Add my favourite'}>{isFavorite(a)?'⭐':'☆'}</button></div></article>)}</div>{searchActivities.length===0&&<p className="empty">No ideas match your selection. Add the first one!</p>}</section>}
 {tab==='Calendar'&&<section className="page"><div className="toolbar row wrap"><button className="icon-button" onClick={()=>setCalendarCenter(calendarView==='week'?subWeeks(calendarCenter,1):subMonths(calendarCenter,1))}><ChevronLeft/></button><h2 className="grow">{format(calendarCenter,calendarView==='week'?'MMMM d, yyyy':'MMMM yyyy')}</h2><button className="icon-button" onClick={()=>setCalendarCenter(calendarView==='week'?addWeeks(calendarCenter,1):addMonths(calendarCenter,1))}><ChevronRight/></button><button className="ghost" onClick={()=>setCalendarCenter(new Date())}>Today</button><select aria-label="Calendar view" value={calendarView} onChange={e=>setCalendarView(e.target.value as typeof calendarView)}><option value="month">Month</option><option value="week">Week</option><option value="agenda">Agenda</option></select></div><div className="row wrap scopes">{scopeOptions.map(s=><label className="toggle" key={s.id}><input type="checkbox" checked={visibleScopes.includes(s.id)} onChange={()=>setVisibleScopes(p=>p.includes(s.id)?p.filter(x=>x!==s.id):[...p,s.id])}/>{s.label}</label>)}</div>
 {calendarView==='agenda'?<div className="panel">{calendarEvents.filter(o=>o.starts_at&&new Date(o.starts_at)>=startOfMonth(calendarCenter)&&new Date(o.starts_at)<=endOfMonth(calendarCenter)).sort((a,b)=>oDate(a)-oDate(b)).map(o=><button key={o.id} className="item action-row" onClick={()=>setSelectedOccurrence(o)}><span className="date-box">{format(new Date(o.starts_at!),'d')}<small>{format(new Date(o.starts_at!),'EEE')}</small></span><span className="grow"><strong>{activityName(o)}</strong><small>{when(o.starts_at)} · {o.status}</small></span></button>)}</div>:<div className="calendar"><div className="weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><span key={d}>{d}</span>)}</div><div className="calendar-grid">{(calendarView==='week'?Array.from({length:7},(_,i)=>addDays(addDays(calendarCenter,-((calendarCenter.getDay()+6)%7)),i)):calendarDays(calendarCenter)).map((d,i)=><div className={'calendar-day '+(d.getMonth()!==calendarCenter.getMonth()&&calendarView==='month'?'other':'')+(isSameDay(d,new Date())?' today':'')} key={i}><button className="day-number" onClick={()=>openEvent(undefined,new Date(d.getFullYear(),d.getMonth(),d.getDate(),18,0))}>{format(d,'d')} <Plus size={11}/></button>{calendarEvents.filter(o=>o.starts_at&&isSameDay(new Date(o.starts_at),d)).slice(0,4).map(o=><button key={o.id} className={'cal-event '+o.status} onClick={()=>setSelectedOccurrence(occurrences.find(x=>x.id===o.id.split('@')[0])||o)} title={activityName(o)}>{activityName(o)}</button>)}{calendarEvents.filter(o=>o.starts_at&&isSameDay(new Date(o.starts_at),d)).length>4&&<small>More…</small>}</div>)}</div></div>}
 <button className="primary" onClick={()=>openEvent()}><Plus size={17}/> Add plan</button></section>}
 {tab==='Map'&&<section className="page"><div className="toolbar"><select value={mapStatus} onChange={e=>setMapStatus(e.target.value)} aria-label="Map activity status"><option value="all">All locations</option><option value="ideas">Ideas only</option><option value="upcoming">Planned</option><option value="completed">Visited</option><option value="favourites">⭐ My favourites</option></select><Key>{mapActivities.filter(a=>a.lat!==null&&a.lng!==null).length} pinned places</Key></div><div className="row wrap map-legend"><Key>💡 Gold · Idea</Key><Key>📅 Blue · Planned</Key><Key>✅ Green · Visited</Key><Key>📍 Pink · Search result</Key></div><PlaceSearch onSelect={setMapFocus}/>{mapFocus&&<div className="row wrap"><span className="muted">📍 {mapFocus.label}</span><button className="primary compact" onClick={()=>setIdea({...BLANK_IDEA,location_label:mapFocus.label,lat:mapFocus.lat,lng:mapFocus.lng})}>Save this place as an idea</button><button className="ghost compact" onClick={()=>setMapFocus(null)}>Clear</button></div>}<ActivityMap activities={mapActivities} occurrences={visibleOccurrences} onSelect={openDetail} selected={mapFocus?[mapFocus.lat,mapFocus.lng]:null}/><p className="muted">Click a place to open its activity. Add locations by choosing a point on the map when editing an idea. No home coordinates are required.</p></section>}
 {tab==='Memories'&&<section className="page"><div className="toolbar"><h2 className="grow">Your story so far</h2><Key>{completed.length} experiences</Key><Key>{completed.reduce((sum,o)=>sum+(o.actual_cost||0),0).toFixed(2)} € spent</Key></div><div className="stats"><div className="stat"><strong>{completed.length}</strong><span>Experiences</span></div><div className="stat"><strong>{new Set(completed.map(o=>byId.get(o.activity_id)?.location_label).filter(Boolean)).size}</strong><span>Places visited</span></div><div className="stat"><strong>{completed.filter(o=>Number(meanRating(o))===5).length}</strong><span>5-star memories</span></div><div className="stat"><strong>{new Set(completed.map(o=>o.starts_at?.slice(0,7))).size}</strong><span>Active months</span></div></div><div className="year-heatmap"><h3>This year’s experiences</h3><div className="heatmap-days">{Array.from({length:365+Number(new Date(new Date().getFullYear(),1,29).getMonth()===1)},(_,i)=>{const day=new Date(new Date().getFullYear(),0,i+1);const n=completed.filter(o=>o.starts_at&&isSameDay(new Date(o.starts_at),day)).length;return <span className={n?'filled':''} title={`${format(day,'d MMM')}: ${n} activities`} key={i} style={{opacity:n?Math.min(1,.45+n*.2):1}}/>})}</div></div><div className="memory-list">{completed.map(o=><article className="memory-card" key={o.id}><span className="eyebrow">{when(o.starts_at)}</span><h3>{activityName(o)}</h3><p>{surpriseSafe(o)?'Surprise activity':o.memory||'Add a photo or write what made this special.'}</p><div className="row wrap">{meanRating(o)&&<span aria-label="Average rating">⭐ {meanRating(o)} ({experienceRatings(o).length})</span>}<Key>{byId.get(o.activity_id)?.category||'Experience'}</Key><button className="secondary compact" onClick={()=>setSelectedOccurrence(o)}>Open memory</button></div><PhotoStrip photos={photos.filter(p=>p.occurrence_id===o.id)}/></article>)}</div>{completed.length===0&&<p className="empty">Completed activities become memories you can revisit here.</p>}</section>}
 {tab==='Groups'&&<section className="page"><div className="row wrap"><button className="primary" onClick={()=>setGroupModal(true)}><Plus size={17}/> Create group</button><input placeholder="Paste invitation code" aria-label="Invitation code" value={joinCode} onChange={e=>setJoinCode(e.target.value)}/><button className="secondary" disabled={!joinCode.trim()||busy} onClick={()=>void join()}>Join group</button></div><div className="cards">{groups.map(g=><article className="idea-card" key={g.id}><span className="eyebrow">{g.kind.toUpperCase()}</span><h3>{groupLabel(g)}</h3><p>{members.filter(m=>m.group_id===g.id).length} members · {activities.filter(a=>a.group_id===g.id).length} ideas</p>{g.owner_id===user.id&&<><button className="secondary compact" onClick={()=>invite(g)}><Share2 size={16}/> Invite people</button>{invitations.filter(i=>i.group_id===g.id&&new Date(i.expires_at)>new Date()&&i.uses<i.max_uses).map(i=><div className="invite-entry" key={i.id}><small>Active invite · {i.uses}/{i.max_uses} joined · expires {format(new Date(i.expires_at),'d MMM')}</small><button className="ghost compact" onClick={()=>{setInviteCode(i.code);setInviteModal(true)}}>Show</button><button className="danger compact" onClick={()=>act(async()=>{assertOk((await supabase.from('invitations').delete().eq('id',i.id)).error)})}>Revoke</button></div>)}</>}<div className="members">{members.filter(m=>m.group_id===g.id).map(m=><div key={m.user_id} className="row space"><small>{m.user_id===user.id?'You':profiles.find(p=>p.id===m.user_id)?.display_name||m.user_id.slice(0,8)+'…'}{m.user_id===g.owner_id?' (owner)':''}</small>{g.owner_id===user.id&&m.user_id!==user.id&&<button className="ghost compact" onClick={()=>removeMember(g,m)}>Remove</button>}</div>)}</div>{g.owner_id!==user.id?<button className="danger compact" onClick={()=>removeMember(g,{group_id:g.id,user_id:user.id})}>Leave group</button>:<button className="danger compact" onClick={()=>{if(confirm(`Delete group "${g.name}" and ALL its shared content?`))void act(async()=>{assertOk((await supabase.from('groups').delete().eq('id',g.id)).error)})}}>Delete group</button>}</article>)}</div>{groups.length===0&&<p className="empty">Create your first group and invite your favourite person.</p>}</section>}
 {tab==='Settings'&&<section className="page settings-page"><div className="panel"><h2>Your account</h2><p className="muted">{user.email}</p><Field label="Display name"><input value={personalName} maxLength={80} onChange={e=>setPersonalName(e.target.value)}/></Field><button className="secondary" onClick={()=>saveProfile()}>Save name</button><Field label="New password (optional)"><input type="password" minLength={6} placeholder="Set a new password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></Field><button className="secondary" disabled={newPassword.length<6} onClick={()=>act(async()=>{assertOk((await supabase.auth.updateUser({password:newPassword})).error);setNewPassword('');setNotice('Password updated')})}>Change password</button><button className="danger" onClick={()=>supabase.auth.signOut()}>Sign out</button></div><div className="panel"><h2>Appearance and reminders</h2><label className="toggle"><input type="checkbox" checked={dark} onChange={e=>setDark(e.target.checked)}/> Dark mode</label><label className="toggle"><input type="checkbox" checked={notifications} onChange={async e=>{if(e.target.checked&&'Notification'in window){const permission=await Notification.requestPermission();setNotifications(permission==='granted')}else setNotifications(false)}}/> Enable in-session browser alerts</label><p className="muted">Due dates are always shown on Home. Browser notifications here operate while the app is open; background push delivery is not included.</p></div><div className="panel"><h2>Your data</h2><div className="row wrap"><button className="secondary" onClick={exportData}><Download size={17}/> Export accessible records (JSON)</button><button className="secondary" onClick={()=>download('together-calendar.ics',makeICS(visibleOccurrences,visibleActivities),'text/calendar')}><CalendarDays size={17}/> Export visible calendar (.ics)</button></div><Field label="Import ideas from a Together JSON backup (creates private copies only)"><input type="file" accept="application/json,.json" onChange={e=>{const f=e.target.files?.[0];if(f)void importPersonal(f);e.target.value=''}}/></Field><p className="muted">JSON export records photo metadata, not the image bytes. Download important photos separately. Imports never overwrite other members' content.</p></div><div className="panel"><h2>Privacy</h2><p>My Space is visible only to you. Group activity is visible only to group members. Invites expire. Surprise details are stored separately and shown only to their creator.</p><p className="muted">Group members can edit shared activities. Leaving a group removes access to its data. A group owner can delete the group.</p></div></section>}
 </div><nav className="mobile-nav" aria-label="Mobile navigation">{tabs.map(t=>{const Icon=icon[t];return <button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}><Icon size={21}/><span>{t}</span></button>})}</nav>
 {idea&&<Modal title={idea.id?'Edit idea':'Add an idea'} onClose={()=>setIdea(null)}><form className="form" onSubmit={saveIdea}><Field label="Title *"><input required maxLength={180} autoFocus value={idea.title||''} onChange={e=>setIdea({...idea,title:e.target.value})}/></Field><div className="two"><Field label="Space"><select disabled={Boolean(idea.id)} value={idea.group_id||'personal'} onChange={e=>setIdea({...idea,group_id:e.target.value==='personal'?null:e.target.value})}><option value="personal">🔒 My Space</option>{groups.map(g=><option key={g.id} value={g.id}>{groupLabel(g)}</option>)}</select></Field><Field label="Category"><select value={idea.category} onChange={e=>setIdea({...idea,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></Field></div><Field label="Description"><textarea rows={3} value={idea.description||''} onChange={e=>setIdea({...idea,description:e.target.value})}/></Field><Field label="Website / ticket link"><input type="url" placeholder="https://…" value={idea.url||''} onChange={e=>setIdea({...idea,url:e.target.value})}/></Field><button type="button" className="ghost compact" disabled={!idea.url||busy} onClick={()=>extractURL(idea.url!)}>Suggest details from website (optional)</button><Field label="Tags (comma-separated)"><input value={(idea.tags||[]).join(', ')} onChange={e=>setIdea({...idea,tags:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}/></Field><div className="two"><Field label="Estimated € per person"><input type="number" min={0} step="0.01" value={idea.estimated_cost??''} onChange={e=>setIdea({...idea,estimated_cost:e.target.value===''?null:Number(e.target.value)})}/></Field><Field label="Duration (minutes)"><input type="number" min={1} value={idea.duration_minutes??''} onChange={e=>setIdea({...idea,duration_minutes:e.target.value===''?null:Number(e.target.value)})}/></Field></div><div className="two"><Field label="Season"><select value={idea.season||''} onChange={e=>setIdea({...idea,season:e.target.value||null})}>{['','Spring','Summer','Autumn','Winter','Any'].map(s=><option key={s}>{s}</option>)}</select></Field><Field label="Weather"><select value={idea.weather||''} onChange={e=>setIdea({...idea,weather:e.target.value||null})}>{['','Indoor','Sunny','Dry','Any'].map(s=><option key={s}>{s}</option>)}</select></Field></div><PlaceSearch onSelect={onPlaceFound}/><Field label="Location name (e.g. museum, city, or 'Home')"><input value={idea.location_label||''} onChange={e=>setIdea({...idea,location_label:e.target.value||null})}/></Field><label className="toggle"><input type="checkbox" checked={Boolean(idea.approximate)} onChange={e=>setIdea({...idea,approximate:e.target.checked})}/> Approximate location</label><p className="muted">Optional: click the map to set a pin. Avoid pinning your home address.</p><ActivityMap activities={[]} occurrences={[]} selected={idea.lat!==null&&idea.lat!==undefined&&idea.lng!==null&&idea.lng!==undefined?[idea.lat,idea.lng]:null} pick={(lat,lng)=>setIdea({...idea,lat,lng})}/><div className="row wrap"><small>{idea.lat==null?'No map pin':`${idea.lat.toFixed(5)}, ${idea.lng?.toFixed(5)}`}</small><button type="button" className="ghost compact" onClick={()=>setIdea({...idea,lat:null,lng:null})}>Clear pin</button></div><p className="muted">After saving, open Details to attach inspiration photos. Personal favourites can be starred from the idea card; they are never shared.</p><footer className="modal-footer"><button className="ghost" type="button" onClick={()=>setIdea(null)}>Cancel</button><button className="primary" disabled={busy} type="submit">Save idea</button></footer></form></Modal>}
 {event&&<Modal title={event.id?'Edit plan':'Plan an experience'} onClose={()=>{setEvent(null);setEventSecret(null)}}><form className="form" onSubmit={saveOccurrence}><Field label="Activity *"><select required value={eventActivity} disabled={Boolean(event.id)} onChange={e=>setEventActivity(e.target.value)}><option value="">Choose an idea…</option>{activities.map(a=><option key={a.id} value={a.id}>{a.title} ({a.group_id?groups.find(g=>g.id===a.group_id)?.name:'Private'})</option>)}</select></Field><Field label="Optional event title"><input value={event.title_override||''} onChange={e=>setEvent({...event,title_override:e.target.value||null})}/></Field><div className="two"><Field label="Status"><select value={event.status} onChange={e=>setEvent({...event,status:e.target.value as Occurrence['status']})}>{['proposed','planned','confirmed','completed','cancelled'].map(s=><option key={s}>{s}</option>)}</select></Field><Field label="Repeats"><select value={event.repeat_rule} onChange={e=>setEvent({...event,repeat_rule:e.target.value as Occurrence['repeat_rule']})}>{['none','weekly','monthly','yearly'].map(s=><option key={s}>{s}</option>)}</select></Field></div><div className="two"><DateField label="Starts" value={event.starts_at} onChange={v=>setEvent({...event,starts_at:v})}/><DateField label="Ends" value={event.ends_at} onChange={v=>setEvent({...event,ends_at:v})}/><DateField label="Available from" value={event.available_from} onChange={v=>setEvent({...event,available_from:v})}/><DateField label="Available until" value={event.available_until} onChange={v=>setEvent({...event,available_until:v})}/><DateField label="Tickets go on sale" value={event.ticket_sale_at} onChange={v=>setEvent({...event,ticket_sale_at:v})}/><DateField label="Booking deadline" value={event.booking_deadline} onChange={v=>setEvent({...event,booking_deadline:v})}/></div><div className="two"><Field label="Ticket status"><select value={event.ticket_status} onChange={e=>setEvent({...event,ticket_status:e.target.value as Occurrence['ticket_status']})}>{['none','needed','reserved','purchased'].map(s=><option key={s}>{s}</option>)}</select></Field><Field label="Number of tickets"><input type="number" min={0} value={event.ticket_count??''} onChange={e=>setEvent({...event,ticket_count:e.target.value===''?null:Number(e.target.value)})}/></Field></div><Field label="Booking URL"><input type="url" value={event.ticket_url||''} onChange={e=>setEvent({...event,ticket_url:e.target.value||null})}/></Field><label className="toggle"><input type="checkbox" checked={event.visibility==='surprise'} onChange={e=>{setEvent({...event,visibility:e.target.checked?'surprise':'normal',title_override:e.target.checked?null:event.title_override});setEventSecret(e.target.checked?{title:'',details:''}:null)}}/> Surprise (hide plan details from group)</label>{event.visibility==='surprise'&&<><p className="muted">For actual secrecy, use an idea named "Surprise plan" without descriptive fields or location. The private title and details below are visible only to you.</p><Field label="Private real title"><input value={eventSecret?.title||secrets.find(s=>s.occurrence_id===event.id)?.true_title||''} onChange={e=>setEventSecret({...eventSecret||{details:''},title:e.target.value})}/></Field><Field label="Private surprise details"><textarea value={eventSecret?.details||secrets.find(s=>s.occurrence_id===event.id)?.details||''} onChange={e=>setEventSecret({...eventSecret||{title:''},details:e.target.value})}/></Field></>}
 <div className="two"><Field label="Actual total cost €"><input type="number" min={0} step="0.01" value={event.actual_cost??''} onChange={e=>setEvent({...event,actual_cost:e.target.value===''?null:Number(e.target.value)})}/></Field></div><Field label="Memory / notes shared with participants"><textarea rows={3} value={event.memory||''} onChange={e=>setEvent({...event,memory:e.target.value})}/></Field><footer className="modal-footer"><button type="button" className="ghost" onClick={()=>setEvent(null)}>Cancel</button><button className="primary" disabled={busy||!eventActivity}>Save plan</button></footer></form></Modal>}
 {detail&&<Modal title="Activity details" onClose={()=>setDetail(null)}><div className="detail"><span className="eyebrow">{detail.group_id?groups.find(g=>g.id===detail.group_id)?.name:'🔒 My Space'} · {detail.category}</span><h2>{detail.title}</h2><p>{detail.description}</p>{detail.tags.length>0&&<div className="row wrap">{detail.tags.map(t=><Key key={t}>{t}</Key>)}</div>}<div className="mini-details">{detail.location_label&&<span>📍 {detail.location_label}</span>}{detail.estimated_cost!=null&&<span>€{detail.estimated_cost}/person</span>}{detail.duration_minutes&&<span>⏱ {detail.duration_minutes} min</span>}{detail.season&&<span>{detail.season}</span>}</div>{detail.url&&<button className="link" onClick={()=>goUrl(detail.url)}>Open website ↗</button>}<div className="row wrap"><button className="secondary compact" disabled={busy} onClick={()=>void toggleFavorite(detail)} aria-pressed={isFavorite(detail)}>{isFavorite(detail)?'⭐ My favourite':'☆ Add to my favourites'}</button></div><h3>What does everyone think?</h3><div className="row wrap">{(['love','maybe','pass'] as const).map(s=><button key={s} className={myVote(detail)===s?'secondary':'ghost'} disabled={busy} aria-pressed={myVote(detail)===s} onClick={()=>vote(detail,s)}>{s==='love'?'❤️':s==='maybe'?'🤔':'✕'} {s} ({votes.filter(v=>v.activity_id===detail.id&&v.sentiment===s).length})</button>)}</div><h3>Inspiration photos</h3><p className="muted">Attach pictures before making a plan; photos in a shared idea are visible to everyone in that group.</p>
  <PhotoStrip photos={ideaPhotos.filter(p=>p.activity_id===detail.id)} me={user.id} removePhoto={p=>removePhoto(p,'idea')} onCaptionChange={(p,c)=>changePhotoCaption(p,'idea',c)}/>
  <PhotoUpload onUpload={(file,caption)=>uploadMedia('idea',detail.id,file,caption)} onFinished={()=>void fetchData().catch(e=>setError(errmsg(e)))}/>
  <h3>🔒 My private note</h3><p className="muted">Only you can see this, even when the idea belongs to a group.</p><textarea rows={3} value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder="Your personal thoughts…"/><button className="secondary compact" onClick={()=>saveNote(detail)}>Save private note</button><h3>Plans and visits</h3>{occurrences.filter(o=>o.activity_id===detail.id).map(o=><button key={o.id} className="item action-row" onClick={()=>{setDetail(null);setSelectedOccurrence(o)}}><span className="grow"><strong>{activityName(o)}</strong><small>{when(o.starts_at)} · {o.status}</small></span></button>)}<div className="row wrap"><button className="primary" onClick={()=>openEvent(detail)}><Plus size={16}/> Make a plan</button><button className="secondary" onClick={()=>{setIdea({...detail});setDetail(null)}}><Edit3 size={16}/> Edit</button><button className="danger" onClick={()=>removeActivity(detail)}><Trash2 size={16}/> Delete</button></div><h3>Share a copy</h3><p className="muted">Copies share only the idea. Personal notes, photos, votes and schedules stay private to their original space.</p><select defaultValue="" aria-label="Choose group to share with" onChange={e=>{const v=e.target.value;if(v){void share(detail,v==='personal'?null:v);e.target.value=''}}}><option value="">Choose destination…</option><option value="personal">🔒 My Space</option>{groups.filter(g=>g.id!==detail.group_id).map(g=><option key={g.id} value={g.id}>{groupLabel(g)}</option>)}</select></div></Modal>}
 {selectedOccurrence&&<Modal title="Plan & memory" onClose={()=>setSelectedOccurrence(null)}><div className="detail"><span className="eyebrow">{selectedOccurrence.status.toUpperCase()}</span><h2>{activityName(selectedOccurrence)}</h2><p>{when(selectedOccurrence.starts_at)}</p>{selectedOccurrence.available_until&&<p>Available until: {when(selectedOccurrence.available_until)}</p>}{selectedOccurrence.booking_deadline&&<p>Booking deadline: {when(selectedOccurrence.booking_deadline)}</p>}{selectedOccurrence.ticket_sale_at&&<p>Tickets on sale: {when(selectedOccurrence.ticket_sale_at)}</p>}<Key>Group tickets: {selectedOccurrence.ticket_status}</Key><h3>My tickets</h3><div className="row wrap">{(['needed','reserved','purchased'] as const).map(t=><button key={t} className={ticketClaims.find(c=>c.occurrence_id===selectedOccurrence.id&&c.user_id===user.id)?.status===t?'secondary':'ghost'} onClick={()=>claimTicket(selectedOccurrence,t)}>{t}</button>)}</div><small>Other participants: {ticketClaims.filter(c=>c.occurrence_id===selectedOccurrence.id&&c.status==='purchased').length} marked purchased</small>{selectedOccurrence.ticket_url&&!surpriseSafe(selectedOccurrence)&&<button className="link" onClick={()=>goUrl(selectedOccurrence.ticket_url)}>Booking link ↗</button>}{secrets.find(s=>s.occurrence_id===selectedOccurrence.id)&&<p className="private-note">🔒 Your surprise details: {secrets.find(s=>s.occurrence_id===selectedOccurrence.id)?.true_title} — {secrets.find(s=>s.occurrence_id===selectedOccurrence.id)?.details}</p>}
 <h3>Can you come?</h3><div className="row wrap">{(['yes','maybe','no'] as const).map(s=><button key={s} className={myRsvp(selectedOccurrence)===s?'secondary':'ghost'} onClick={()=>rsvp(selectedOccurrence,s)}>{s} ({rsvps.filter(r=>r.occurrence_id===selectedOccurrence.id&&r.response===s).length})</button>)}</div>{selectedOccurrence.visibility!=='surprise'&&<><h3>Your experience rating</h3>
  {selectedOccurrence.status==='completed'?<><div className="row wrap rating-stars">{[1,2,3,4,5].map(n=><button type="button" key={n} className={myRating(selectedOccurrence)===n?'secondary':'ghost'} disabled={busy} aria-pressed={myRating(selectedOccurrence)===n} onClick={()=>rateExperience(selectedOccurrence,n)} aria-label={`Rate ${n} stars`}>{n<= (myRating(selectedOccurrence)||0)?'★':'☆'} {n}</button>)}{myRating(selectedOccurrence)&&<button className="ghost compact" onClick={()=>rateExperience(selectedOccurrence,null)}>Clear my rating</button>}</div><p className="muted">{meanRating(selectedOccurrence)?`Group average: ${meanRating(selectedOccurrence)} / 5 from ${experienceRatings(selectedOccurrence).length} rating(s)`:'No ratings yet. Each person rates independently.'}</p></>:<p className="muted">Mark this plan completed before rating it.</p>}
  <h3>Memory</h3><p>{selectedOccurrence.memory||'No memories recorded yet.'}</p><PhotoStrip photos={photos.filter(p=>p.occurrence_id===selectedOccurrence.id)} me={user.id} removePhoto={p=>removePhoto(p,'memory')} onCaptionChange={(p,c)=>changePhotoCaption(p,'memory',c)}/>
  <PhotoUpload onUpload={(file,caption)=>uploadMedia('memory',selectedOccurrence.id,file,caption)} onFinished={()=>void fetchData().catch(e=>setError(errmsg(e)))}/></>}
 <div className="row wrap"><button className="primary" onClick={()=>{setEvent({...selectedOccurrence});setEventActivity(selectedOccurrence.activity_id);setEventSecret(secrets.find(s=>s.occurrence_id===selectedOccurrence.id)?{title:secrets.find(s=>s.occurrence_id===selectedOccurrence.id)!.true_title||'',details:secrets.find(s=>s.occurrence_id===selectedOccurrence.id)!.details}:null);setSelectedOccurrence(null)}}><Edit3 size={16}/> Edit plan / memory</button><button className="danger" onClick={()=>removeOccurrence(selectedOccurrence)}><Trash2 size={16}/> Delete</button></div></div></Modal>}
 {jarOpen&&<Modal title="🎲 The Date Jar" onClose={()=>setJarOpen(false)}><div className="form"><p>Pick something from your ideas. Leave filters empty to be spontaneous.</p><div className="two"><Field label="Maximum € per person"><input type="number" min={0} value={jarBudget} onChange={e=>setJarBudget(e.target.value)}/></Field><Field label="Maximum duration (minutes)"><input type="number" min={1} value={jarDuration} onChange={e=>setJarDuration(e.target.value)}/></Field></div><Field label="Weather / setting"><select value={jarWeather} onChange={e=>setJarWeather(e.target.value)}>{['Any','Indoor','Sunny','Dry'].map(w=><option key={w}>{w}</option>)}</select></Field><label className="toggle"><input type="checkbox" checked={jarUntried} onChange={e=>setJarUntried(e.target.checked)}/> Only untried ideas</label><button className="primary" onClick={()=>{const choices=visibleActivities.filter(a=>(!jarUntried||!occurrences.some(o=>o.activity_id===a.id&&o.status==='completed'))&&(!jarBudget||a.estimated_cost==null||a.estimated_cost<=Number(jarBudget))&&(!jarDuration||a.duration_minutes==null||a.duration_minutes<=Number(jarDuration))&&(jarWeather==='Any'||!a.weather||a.weather==='Any'||a.weather===jarWeather));if(choices.length===0){setNotice('No matching ideas in the selected spaces. Try broader filters.');setJarOpen(false);return}const winner=choices[Math.floor(Math.random()*choices.length)];setJarOpen(false);openDetail(winner);setNotice('🎲 Your Date Jar picked this idea!')}}><Shuffle size={17}/> Pick our next date</button></div></Modal>}
 {groupModal&&<CreateGroup onClose={()=>setGroupModal(false)} onCreate={createGroup}/>} {inviteModal&&<Modal title="Invite members" onClose={()=>setInviteModal(false)}><p>Share this private invitation code with the people you trust. It expires in 7 days and can be used up to 10 times.</p><code className="invite-code">{inviteCode}</code><p className="muted">Recipients sign in, open Groups and paste this code. Anyone holding a valid code can join. Don't post it publicly.</p><button className="secondary" onClick={()=>navigator.clipboard?.writeText(inviteCode).then(()=>setNotice('Code copied')).catch(()=>setError('Copy the code manually'))}>Copy code</button></Modal>}
 </div>
}
function oDate(o:Occurrence){return o.starts_at?new Date(o.starts_at).getTime():0}
function groupLabel(g:Group){return `${g.kind==='couple'?'❤️':g.kind==='friends'?'👯':g.kind==='family'?'🏡':'🌿'} ${g.name}`}
function PhotoStrip({photos,removePhoto,onCaptionChange,me,compact=false}: {photos:(Photo|IdeaPhoto)[];removePhoto?:(p:Photo|IdeaPhoto)=>void;onCaptionChange?:(p:Photo|IdeaPhoto,c:string)=>void;me?:string;compact?:boolean}){
 const [urls,setUrls]=useState<Record<string,string>>({}),[editing,setEditing]=useState<string|null>(null),[draft,setDraft]=useState('')
 useEffect(()=>{let active=true;void Promise.all(photos.map(async p=>{const {data}=await supabase.storage.from('memories').createSignedUrl(p.path,300);return[p.id,data?.signedUrl||''] as const})).then(all=>{if(active)setUrls(Object.fromEntries(all))}).catch(()=>{});return()=>{active=false}},[photos])
 return <div className={'photo-grid '+(compact?'compact-photos':'')}>{photos.map(p=>urls[p.id]&&<div key={p.id} className="photo"><a href={urls[p.id]} target="_blank" rel="noreferrer"><img loading="lazy" alt={p.caption||'Shared photo'} src={urls[p.id]}/></a>{!compact&&<>{editing===p.id?<form className="caption-editor" onSubmit={e=>{e.preventDefault();onCaptionChange?.(p,draft);setEditing(null)}}><input aria-label="Photo caption" maxLength={300} value={draft} onChange={e=>setDraft(e.target.value)}/><button className="secondary compact" type="submit">Save caption</button></form>:<p className="photo-caption">{p.caption||''}</p>}{p.uploaded_by===me&&<div className="row wrap"><button type="button" className="ghost compact" onClick={()=>{setEditing(p.id);setDraft(p.caption||'')}}>✏️ Caption</button>{removePhoto&&<button type="button" className="ghost compact" onClick={()=>removePhoto(p)}>🗑 Delete</button>}</div>}</>}</div>)}</div>
}
function CreateGroup({onClose,onCreate}: {onClose:()=>void;onCreate:(name:string,kind:Group['kind'])=>Promise<void>}){const [name,setName]=useState(''),[kind,setKind]=useState<Group['kind']>('couple');return <Modal title="Create a shared space" onClose={onClose}><form className="form" onSubmit={e=>{e.preventDefault();void onCreate(name.trim(),kind)}}><Field label="Group name"><input required autoFocus maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Group type"><select value={kind} onChange={e=>setKind(e.target.value as Group['kind'])}><option value="couple">❤️ Couple</option><option value="friends">👯 Friends</option><option value="family">🏡 Family</option><option value="custom">🌿 Custom</option></select></Field><p className="muted">Spaces are private. Invite participants from the Groups page after creating.</p><footer className="modal-footer"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary">Create group</button></footer></form></Modal>}
function Auth() {
  type Mode = 'signin' | 'signup' | 'reset' | 'verify'
  type Feedback = { kind: 'success' | 'error'; message: string }
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [verificationEmail, setVerificationEmail] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastEmailSentAt, setLastEmailSentAt] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const googleEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === 'true'
  const redirectTo = window.location.origin + import.meta.env.BASE_URL
  const resendCooldown = Math.max(0, Math.ceil((lastEmailSentAt + 60000 - clock) / 1000))

  useEffect(() => {
    if (mode !== 'verify' || resendCooldown === 0) return
    const id = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [mode, resendCooldown])

  function changeMode(next: Mode) {
    setMode(next)
    setFeedback(null)
    setPassword('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setFeedback(null)
    const address = email.trim()
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: address, password })
        if (error?.code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message || '')) {
          setVerificationEmail(address)
          setMode('verify')
          setFeedback({ kind: 'error', message: 'Your email address is not verified yet. Open the confirmation email, follow its link, then return to Together.' })
          return
        }
        assertOk(error)
        setFeedback({ kind: 'success', message: 'Signed in. Opening your space…' })
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: address,
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: redirectTo }
        })
        assertOk(error)
        if (data.session) {
          setFeedback({ kind: 'success', message: 'Account created and signed in.' })
        } else {
          setVerificationEmail(address)
          setLastEmailSentAt(Date.now())
          setClock(Date.now())
          setPassword('')
          setMode('verify')
          setFeedback({ kind: 'success', message: 'If this is a new account, a verification email will be sent. You must verify your email before signing in.' })
        }
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo })
        assertOk(error)
        setFeedback({ kind: 'success', message: 'If that account exists, password-reset instructions have been requested. Check your inbox and spam folder.' })
      }
    } catch (error) {
      setFeedback({ kind: 'error', message: friendlyAuthError(error) })
    } finally {
      setBusy(false)
    }
  }

  async function resendConfirmation() {
    if (busy || resendCooldown > 0 || !verificationEmail) return
    setBusy(true)
    setFeedback(null)
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup', email: verificationEmail,
        options: { emailRedirectTo: redirectTo }
      })
      assertOk(error)
      setLastEmailSentAt(Date.now())
      setClock(Date.now())
      setFeedback({ kind: 'success', message: 'If this account is awaiting confirmation, another verification email has been requested. Check your inbox and spam folder.' })
    } catch (error) {
      setFeedback({ kind: 'error', message: friendlyAuthError(error) })
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({provider: 'google', options: {redirectTo}})
      assertOk(error)
    } catch (error) {
      setFeedback({ kind: 'error', message: friendlyAuthError(error) })
    } finally {
      setBusy(false)
    }
  }

  return <div className="auth-page"><div className="auth-card">
    <Heart size={40} fill="currentColor" />
    <div className="eyebrow">YOUR PEOPLE · YOUR PLANS · YOUR STORIES</div>
    <h1>Together</h1>
    <p>A private home for shared experiences, little adventures and favourite memories.</p>

    {mode === 'verify' ? <section className="auth-confirm">
      <h2>Check your email</h2>
      <p>We need to verify <strong>{verificationEmail}</strong> before you can sign in.</p>
      <ol><li>Open your inbox (and spam folder).</li><li>Click the confirmation link from Together / Supabase.</li><li>Return here to sign in if you aren't signed in automatically.</li></ol>
      <p className="muted">Email delivery can take a little while. Repeated requests may hit the shared email limit.</p>
      <button type="button" className="secondary" disabled={busy || resendCooldown > 0} onClick={() => void resendConfirmation()}>
        {busy ? 'Sending…' : resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : 'Resend verification email'}
      </button>
      <button type="button" className="link" onClick={() => changeMode('signin')}>Already verified? Sign in</button>
      <button type="button" className="link" onClick={() => changeMode('signup')}>Use a different email</button>
    </section> : <>
      <h2 className="auth-mode-title">{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create an account' : 'Reset your password'}</h2>
      {mode === 'signup' && <p className="muted">You will need to verify your email address before your first sign-in.</p>}
      {mode === 'reset' && <p className="muted">We'll request a password-reset link for this email address.</p>}
      <form onSubmit={e => void submit(e)} className="form">
        {mode === 'signup' && <Field label="Your name"><input required autoComplete="name" maxLength={80} value={name} onChange={e => setName(e.target.value)} /></Field>}
        <Field label="Email"><input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
        {mode !== 'reset' && <Field label="Password"><input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} required value={password} onChange={e => setPassword(e.target.value)} /></Field>}
        <button className="primary" disabled={busy}>{busy ? 'Working…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button>
      </form>
      {googleEnabled && mode !== 'reset' && <div className="auth-oauth"><span>or</span><button type="button" className="secondary" disabled={busy} onClick={() => void signInWithGoogle()}>Continue with Google</button></div>}
      <div className="row wrap auth-links">
        <button type="button" className="link" onClick={() => changeMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Create an account' : 'Back to sign in'}</button>
        {mode !== 'reset' && <button type="button" className="link" onClick={() => changeMode('reset')}>Forgot password?</button>}
      </div>
    </>}
    {feedback && <div className={`auth-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback.message}</div>}
  </div></div>
}
