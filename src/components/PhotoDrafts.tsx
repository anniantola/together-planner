import { useEffect, useState } from 'react'
import { checkImage } from '../lib/photo-utils'

export type PhotoDraft = { id:string; file:File; caption:string }
function Thumb({file}: {file:File}) {
 const [preview,setPreview]=useState('')
 useEffect(()=>{const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file])
 return preview?<img alt="Selected photo preview" src={preview}/>:null
}
export default function PhotoDrafts({photos,onChange,disabled=false}: {photos:PhotoDraft[];onChange:(files:PhotoDraft[])=>void;disabled?:boolean}) {
 const [problem,setProblem]=useState('')
 function add(list:FileList|null) {
  if(!list)return
  const next=[...photos];const failures:string[]=[]
  for(const file of Array.from(list)) {
   if(next.length>=20){failures.push('Maximum 20 photos per save');break}
   const message=checkImage(file)
   if(message){failures.push(`${file.name}: ${message}`);continue}
   next.push({id:crypto.randomUUID(),file,caption:''})
  }
  onChange(next);setProblem(failures.join(' · '))
 }
 return <div className="photo-uploader"><label className="field"><span>Add photographs (up to 20 at once)</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" disabled={disabled} onChange={e=>{add(e.target.files);e.target.value=''}}/></label>
  {problem&&<p className="form-warning" role="alert">{problem}</p>}
  {photos.length>0&&<div className="pending-photos">{photos.map((p,i)=><div className="pending-photo" key={p.id}><Thumb file={p.file}/><label className="field"><span>Caption {i+1}</span><input value={p.caption} maxLength={300} disabled={disabled} onChange={e=>onChange(photos.map(x=>x.id===p.id?{...x,caption:e.target.value}:x))}/></label><button type="button" className="ghost compact" disabled={disabled} onClick={()=>onChange(photos.filter(x=>x.id!==p.id))}>Remove photo</button></div>)}</div>}
 </div>
}
