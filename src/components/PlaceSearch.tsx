import { useEffect, useRef, useState } from 'react'
import { searchPlaces } from '../lib/place-search'
import type { PlaceResult } from '../lib/place-search'
const key = import.meta.env.VITE_GEOAPIFY_API_KEY || ''
export default function PlaceSearch({onSelect}: {onSelect:(place:PlaceResult)=>void}) {
 const [query,setQuery]=useState(''),[results,setResults]=useState<PlaceResult[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false)
 const controller=useRef<AbortController|null>(null)
 useEffect(()=>()=>controller.current?.abort(),[])
 async function submit(){
 controller.current?.abort();const current=new AbortController();controller.current=current
  setResults([]);setError('');setLoading(true)
  try {const places=await searchPlaces(query,key,current.signal);if(current.signal.aborted)return;setResults(places);if(!places.length)setError('No matches. Try adding the city or country, or place a pin manually.')}
  catch(e){if(!current.signal.aborted)setError(e instanceof Error?e.message:'Location search failed')}
  finally{if(!current.signal.aborted)setLoading(false)}
 }
 return <div className="place-search">
  <div className="place-search-form">
   <label className="field"><span>Search a place or address</span><input value={query} placeholder="Museum, street address, city…" maxLength={200} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void submit()}}} autoComplete="off"/></label>
   <button type="button" onClick={()=>void submit()} className="secondary" disabled={!key||loading||query.trim().length<3}>{loading?'Searching…':'Find place'}</button>
  </div>
  {!key&&<p className="muted">Place lookup is not configured yet. Add <code>VITE_GEOAPIFY_API_KEY</code> to GitHub Actions variables and the build workflow; manual pins still work.</p>}
  {error&&<p role="status" className="muted">{error}</p>}
  {results.length>0&&<div className="place-results" aria-label="Matching locations">{results.map(p=><button type="button" key={p.id} onClick={()=>{onSelect(p);setQuery(p.label);setResults([]);setError('')}}><span>📍 {p.label}</span><small>Use location →</small></button>)}</div>}
  <p className="muted place-credit">Search by Geoapify · OpenStreetMap contributors. Queries are sent to Geoapify; avoid searching private home addresses.</p>
 </div>
}
