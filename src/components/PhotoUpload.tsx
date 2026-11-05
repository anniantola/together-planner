import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { checkImage } from '../lib/photo-utils'
type Pending = {id:string;file:File;preview:string;caption:string}
export default function PhotoUpload({onUpload,onFinished}: {onUpload:(file:File,caption:string)=>Promise<void>;onFinished?:()=>void}) {
 const [pending,setPending]=useState<Pending[]>([]),[loading,setLoading]=useState(false),[message,setMessage]=useState('')
 const urlRefs=useRef<string[]>([])
 useEffect(()=>()=>urlRefs.current.forEach(u=>URL.revokeObjectURL(u)),[])
 function release(urls:string[]){for(const url of urls){URL.revokeObjectURL(url);urlRefs.current=urlRefs.current.filter(u=>u!==url)}}
 function select(e:ChangeEvent<HTMLInputElement>){
  const all=Array.from(e.target.files||[])
  if(all.length>8){setMessage('Choose at most 8 photos per upload.');e.target.value='';return}
  const files=all
  const bad=files.map(f=>checkImage(f)).find(Boolean)
  if(bad){setMessage(bad);e.target.value='';return}
  release(pending.map(p=>p.preview))
  const created=files.map(f=>({id:crypto.randomUUID(),file:f,preview:URL.createObjectURL(f),caption:''}))
  urlRefs.current.push(...created.map(p=>p.preview));setPending(created)
  setMessage('');e.target.value=''
 }
 async function submit(){if(loading)return;setLoading(true);setMessage('')
  let saved=0
  try{for(const item of pending){await onUpload(item.file,item.caption);saved++}
   release(pending.map(p=>p.preview));setPending([]);onFinished?.();setMessage(`${saved} photo${saved===1?'':'s'} uploaded.`)
  }catch(e){if(saved>0)onFinished?.();release(pending.slice(0,saved).map(p=>p.preview));setPending(old=>old.slice(saved));setMessage(`${saved} uploaded; ${e instanceof Error?e.message:'Upload failed'}. You can retry the remaining photos.`)}
  finally{setLoading(false)}
 }
 return <div className="photo-uploader"><label className="field"><span>Add photos (up to 8 at once, 10 MB each)</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" disabled={loading} onChange={select}/></label>
  {pending.length>0&&<><div className="pending-photos">{pending.map(p=><label key={p.id} className="pending-photo"><img src={p.preview} alt={`Preview of ${p.file.name}`}/><span className="field"><span>Caption (optional)</span><input maxLength={300} value={p.caption} disabled={loading} onChange={e=>setPending(old=>old.map(x=>x.id===p.id?{...x,caption:e.target.value}:x))}/></span></label>)}</div>
  <div className="row wrap"><button type="button" className="primary" disabled={loading} onClick={()=>void submit()}>{loading?'Uploading…':`Upload ${pending.length} photo${pending.length===1?'':'s'}`}</button><button type="button" className="ghost" disabled={loading} onClick={()=>{release(pending.map(p=>p.preview));setPending([])}}>Clear selection</button></div></>}
  {message&&<p role="status" className="muted">{message}</p>}
 </div>
}
