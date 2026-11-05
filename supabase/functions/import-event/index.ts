// Optional Supabase Edge Function: cautiously fetch public event HTML metadata.
// Deploy with: supabase functions deploy import-event --no-verify-jwt=false
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
function publicHost(url: URL) {
  if(url.protocol!=='https:' || url.username || url.password || (url.port&&url.port!=='443')) return false
  const host=url.hostname.toLowerCase()
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.example')||!host.includes('.')||host.includes('%')||host.includes('..'))return false
  if(/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(':')||host.startsWith('['))return false
  return true
}
function decode(s:string){return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim().slice(0,2000)}
function meta(html:string,selector:string){const tags=html.match(/<meta\b[^>]*>/gi)||[];for(const t of tags){if(!new RegExp(`(?:name|property)\\s*=\\s*["']${selector}["']`,'i').test(t))continue;const content=t.match(/content\s*=\s*["']([^"']*)["']/i);if(content)return decode(content[1])}return ''}
serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors})
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405,headers:cors})
 try{
  const {url}=await req.json()
  if(typeof url!=='string'||url.length>2048)throw new Error('Invalid URL')
  let target=new URL(url)
  if(!publicHost(target))throw new Error('Only public HTTPS websites are supported')
  // Restrict DNS resolution too: protect against internal service addresses / DNS rebinding.
  const checkDns=async(u:URL)=>{
   if(!publicHost(u))throw new Error('Unsafe website')
   const answers=await Promise.allSettled([Deno.resolveDns(u.hostname,'A'),Deno.resolveDns(u.hostname,'AAAA')])
   const ips=answers.filter(x=>x.status==='fulfilled').flatMap(x=>(x as PromiseFulfilledResult<string[]>).value)
   if(!ips.length)throw new Error('Website has no public address')
   for(const ip of ips){
    if(ip.includes(':')){
     const x=ip.toLowerCase();if(x==='::1'||x==='::'||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe8')||x.startsWith('fe9')||x.startsWith('fea')||x.startsWith('feb')||x.startsWith('::ffff:'))throw new Error('Private address')
    }else{
     const n=ip.split('.').map(Number)
     if(n.length!==4||n.some(v=>v<0||v>255)||n[0]===0||n[0]===10||n[0]===127||n[0]>=224||(n[0]===169&&n[1]===254)||(n[0]===172&&n[1]>=16&&n[1]<=31)||(n[0]===192&&n[1]===168)||(n[0]===100&&n[1]>=64&&n[1]<=127)||(n[0]===198&&n[1]>=18&&n[1]<=19))throw new Error('Private address')
    }
   }
  }
  let response:Response|undefined
  for(let i=0;i<3;i++){
   await checkDns(target)
   response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(7000),headers:{Accept:'text/html'}})
   if([301,302,303,307,308].includes(response.status)){
    const location=response.headers.get('location');if(!location)throw new Error('Invalid redirect')
    target=new URL(location,target);continue
   }
   break
  }
  if(!response?.ok||[301,302,303,307,308].includes(response.status))throw new Error('Page unavailable')
  if(!(response.headers.get('content-type')||'').includes('text/html'))throw new Error('Website is not HTML')
  if(Number(response.headers.get('content-length')||'0')>500000)throw new Error('Page too large')
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty page')
  const chunks:Uint8Array[]=[];let size=0
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>500000){await reader.cancel();throw new Error('Page too large')}chunks.push(value)}
  const html=new TextDecoder().decode(Uint8Array.from(chunks.flatMap(c=>Array.from(c))))
  const title=meta(html,'og:title')||decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]||'')
  const description=meta(html,'og:description')||meta(html,'description')
  return Response.json({title,description,location:''},{headers:cors})
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not extract details'},{status:400,headers:cors})}
})
