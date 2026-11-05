/** Geoapify's browser-safe geocoding API; configure an origin-restricted project key. */
export type PlaceResult = { label:string; lat:number; lng:number; id:string }
export function parsePlaces(payload: unknown): PlaceResult[] {
  const results = (payload as {results?:unknown})?.results
  if(!Array.isArray(results)) return []
  const found:PlaceResult[] = []
  for(const r of results.slice(0,8)){
    if(!r||typeof r!=='object')continue
    const entry=r as Record<string,unknown>
    if(entry.lat==null||entry.lon==null||entry.lat===''||entry.lon==='')continue
    const lat=Number(entry.lat),lng=Number(entry.lon)
    const label=typeof entry.formatted==='string'?entry.formatted.trim():''
    if(!label||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)continue
    found.push({label,lat,lng,id:String(entry.place_id||`${lat},${lng}`)})
  }
  return found
}
export async function searchPlaces(query:string,key:string,signal?:AbortSignal):Promise<PlaceResult[]> {
  const text=query.trim()
  if(text.length<3||text.length>200)throw new Error('Enter at least 3 characters (maximum 200).')
  if(!key)throw new Error('Place search needs a Geoapify API key. See README setup.')
  const url=new URL('https://api.geoapify.com/v1/geocode/search')
  url.searchParams.set('text',text);url.searchParams.set('format','json');url.searchParams.set('limit','6');url.searchParams.set('apiKey',key)
  const response=await fetch(url.toString(),{signal,headers:{Accept:'application/json'},referrerPolicy:'strict-origin-when-cross-origin'})
  if(!response.ok){if(response.status===429)throw new Error('Search limit reached. Try again later.');throw new Error(`Location search unavailable (${response.status}).`)}
  return parsePlaces(await response.json())
}
