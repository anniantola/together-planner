import { afterEach, describe, expect, it, vi } from 'vitest'
import { activityMarker } from '../src/lib/map-icons'
import { parsePlaces, searchPlaces } from '../src/lib/place-search'
import { checkImage } from '../src/lib/photo-utils'
afterEach(()=>vi.unstubAllGlobals())
describe('Social and map enhancements',()=>{
 it('validates photo MIME type, empty files and size limits',()=>{
  expect(checkImage({type:'application/pdf',size:500})).toMatch(/JPG/)
  expect(checkImage({type:'image/jpeg',size:0})).toBeTruthy()
  expect(checkImage({type:'image/jpeg',size:11*1024*1024})).toBeTruthy()
  expect(checkImage({type:'image/webp',size:500})).toBeNull()
 })
 it('accepts valid geocoder results and discards missing/out-of-range coordinates',()=>{
  const result=parsePlaces({results:[
   {formatted:'Museum, Turku',lat:60.45,lon:22.27,place_id:'abc'},
   {formatted:'Nowhere',lat:190,lon:3},
   {formatted:'Missing',lat:null,lon:null}
  ]})
  expect(result).toEqual([{label:'Museum, Turku',lat:60.45,lng:22.27,id:'abc'}])
  expect(parsePlaces({anything:'else'})).toEqual([])
 })
 it('uses expressive category emojis and distinct state markers',()=>{
  const a={id:'one',category:'Food & drink'}
  expect(activityMarker(a,[])).toContain('🍽️')
  expect(activityMarker(a,[])).toContain('idea')
  expect(activityMarker(a,[{activity_id:'one',starts_at:'2026-11-05',status:'planned'}])).toContain('planned')
  expect(activityMarker(a,[{activity_id:'one',starts_at:'2026-11-05',status:'completed'}])).toContain('visited')
  expect(activityMarker({...a,category:'Unrecognized'},[])).toContain('✨')
 })
 it('does not send too-short or missing-key searches',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  await expect(searchPlaces('no','test')).rejects.toThrow(/at least 3/)
  await expect(searchPlaces('Turku','')).rejects.toThrow(/key/)
  expect(fetcher).not.toHaveBeenCalled()
 })
 it('sends submitted searches as encoded requests to the provider',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({results:[{formatted:'Aboa Vetus',lat:60.45,lon:22.27}]})})
  vi.stubGlobal('fetch',fetcher)
  const results=await searchPlaces('Aboa Vetus, Turku','demo-key')
  expect(results).toHaveLength(1)
  const url=new URL(fetcher.mock.calls[0][0] as string)
  expect(url.origin).toBe('https://api.geoapify.com')
  expect(url.searchParams.get('text')).toBe('Aboa Vetus, Turku')
  expect(url.searchParams.get('apiKey')).toBe('demo-key')
 })
 it('reports rate-limit errors without silently accepting empty data',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:429}))
  await expect(searchPlaces('Turku Castle','demo-key')).rejects.toThrow(/limit reached/)
 })
})
