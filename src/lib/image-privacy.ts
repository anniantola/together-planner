import { checkImage } from './photo-utils'

/** Decoding and re-encoding discards EXIF/GPS/XMP/PNG text metadata before upload. */
export function scaledSize(width:number,height:number,maxEdge=2560):{width:number;height:number} {
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>30000||height>30000)throw new Error('Unsupported image dimensions')
 const scale=Math.min(1,maxEdge/Math.max(width,height))
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))}
}

async function decode(file:File):Promise<{image:CanvasImageSource;width:number;height:number;release:()=>void}> {
 if(typeof createImageBitmap==='function') {
  const img=await createImageBitmap(file)
  return {image:img,width:img.width,height:img.height,release:()=>img.close()}
 }
 const url=URL.createObjectURL(file)
 try{
  const img=new Image()
  img.decoding='async'
  img.src=url
  await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Could not decode the image'))})
  return {image:img,width:img.naturalWidth,height:img.naturalHeight,release:()=>URL.revokeObjectURL(url)}
 }catch(e){URL.revokeObjectURL(url);throw e}
}

export async function preparePrivatePhoto(file:File):Promise<File> {
 const invalid=checkImage(file);if(invalid)throw new Error(invalid)
 const decoded=await decode(file)
 try{
  const size=scaledSize(decoded.width,decoded.height)
  const canvas=document.createElement('canvas')
  canvas.width=size.width;canvas.height=size.height
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('Image processing is unavailable in this browser')
  ctx.drawImage(decoded.image,0,0,size.width,size.height)
  const mime=file.type
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not prepare the photo')),mime,mime==='image/jpeg'?0.88:0.92))
  // Some browsers silently fall back to PNG when a requested encoder is missing.
  if(!['image/jpeg','image/png','image/webp'].includes(blob.type))throw new Error('Unsupported image output format')
  if(blob.size>10*1024*1024)throw new Error('Processed photo exceeds 10 MB; try a smaller image')
  const ext=blob.type==='image/jpeg'?'jpg':blob.type==='image/png'?'png':'webp'
  const basename=file.name.replace(/\.[^/.]+$/,'').slice(0,110)||'photo'
  return new File([blob],`${basename}.${ext}`,{type:blob.type,lastModified:Date.now()})
 }finally{decoded.release()}
}
