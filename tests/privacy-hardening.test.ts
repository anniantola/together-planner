import { describe,it,expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { canApplyAccountResponse, readVisibleScopes, scopeStorageKey } from '../src/lib/auth-isolation'
import { buildZip, crc32 } from '../src/lib/backup-zip'
import { scaledSize } from '../src/lib/image-privacy'
import { checkImage } from '../src/lib/photo-utils'

describe('account privacy',()=>{
 it('rejects results from a previous user even if they arrive late',()=>{
  expect(canApplyAccountResponse('b','a',2,1)).toBe(false)
  expect(canApplyAccountResponse('a','a',2,1)).toBe(false)
  expect(canApplyAccountResponse('a','a',2,2)).toBe(true)
  expect(canApplyAccountResponse(null,'a',2,2)).toBe(false)
 })
 it('uses unique scope keys and discards another account’s unknown groups',()=>{
  expect(scopeStorageKey('a')).not.toBe(scopeStorageKey('b'))
  const store={getItem:()=>JSON.stringify(['personal','group-a','group-b','group-a'])}
  expect(readVisibleScopes(store,'user-a',['group-a'])).toEqual(['personal','group-a'])
  expect(readVisibleScopes({getItem:()=>null},'user-b',['group-b'])).toEqual(['personal','group-b'])
 })
})
describe('photo handling',()=>{
 it('rejects animated GIF and unsupported media',()=>{
  expect(checkImage({type:'image/gif',size:1024})).toMatch(/GIF/)
  expect(checkImage({type:'image/webp',size:1024})).toBeNull()
 })
 it('limits size safely without upscaling',()=>{
  expect(scaledSize(4032,3024)).toEqual({width:2560,height:1920})
  expect(scaledSize(500,600)).toEqual({width:500,height:600})
  expect(()=>scaledSize(999999,300)).toThrow()
 })
})
describe('full photo backup',()=>{
 it('produces a ZIP with valid local and central headers',()=>{
  const bytes=buildZip([{path:'records.json',data:new TextEncoder().encode('{"ok":true}')},{path:'photos/ideas/1.png',data:new Uint8Array([1,2,3])}])
  const view=new DataView(bytes.buffer)
  expect(view.getUint32(0,true)).toBe(0x04034b50)
  expect(view.getUint32(bytes.length-22,true)).toBe(0x06054b50)
  expect(view.getUint16(bytes.length-12,true)).toBe(2)
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  expect(()=>buildZip([{path:'../secret',data:new Uint8Array()}])).toThrow()
 })
})
describe('database security contract',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/202611050002_privacy_hardening.sql',import.meta.url),'utf8')
 it('restricts owner-only deletion and surprise photo visibility',()=>{
  expect(sql).toMatch(/create policy activities_delete[\s\S]*?owner_id = \(select auth\.uid\(\)\)/)
  expect(sql).toMatch(/create policy occurrences_delete[\s\S]*?owner_id = \(select auth\.uid\(\)\)/)
  expect(sql).toMatch(/create policy photos_read[\s\S]*?o\.visibility = 'normal'/)
  expect(sql).toMatch(/create policy ratings_read[\s\S]*?o\.visibility = 'normal'/)
  expect(sql).toMatch(/create policy surprise_read[\s\S]*?public\.can_access_activity/)
 })
})
