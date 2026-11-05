/** Minimal non-compressing ZIP writer, so photo backups work offline without a CDN. */
export type ZipFile = {path:string; data:Uint8Array}
const encoder=new TextEncoder()
const te=(s:string)=>encoder.encode(s)
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0})
export function crc32(bytes:Uint8Array):number {
 let crc=0xffffffff
 for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8)
 return (crc^0xffffffff)>>>0
}
function chunk(size:number):{bytes:Uint8Array;view:DataView} {
 const bytes=new Uint8Array(size)
 return {bytes,view:new DataView(bytes.buffer)}
}
export function buildZip(files:ZipFile[]):Uint8Array {
 if(files.length>65535)throw new Error('Too many backup files')
 let offset=0
 const contents:Uint8Array[]=[],central:Uint8Array[]=[]
 for(const file of files){
  // Never allow names that can unpack outside the backup directory.
  if(!file.path||file.path.startsWith('/')||file.path.includes('\\')||file.path.split('/').some(x=>x==='..'||x==='.'))throw new Error('Unsafe backup path')
  const name=te(file.path),data=file.data
  if(name.length>65535||data.length>0xffffffff)throw new Error('Backup file too large')
  const crc=crc32(data),size=data.length
  const local=chunk(30+name.length)
  local.view.setUint32(0,0x04034b50,true)
  local.view.setUint16(4,20,true) // ZIP version
  local.view.setUint16(6,0x0800,true) // UTF-8 names
  local.view.setUint32(14,crc,true)
  local.view.setUint32(18,size,true);local.view.setUint32(22,size,true)
  local.view.setUint16(26,name.length,true)
  local.bytes.set(name,30)
  contents.push(local.bytes,data)
  const dir=chunk(46+name.length)
  dir.view.setUint32(0,0x02014b50,true)
  dir.view.setUint16(4,20,true);dir.view.setUint16(6,20,true)
  dir.view.setUint16(8,0x0800,true)
  dir.view.setUint32(16,crc,true)
  dir.view.setUint32(20,size,true);dir.view.setUint32(24,size,true)
  dir.view.setUint16(28,name.length,true)
  dir.view.setUint32(42,offset,true)
  dir.bytes.set(name,46)
  central.push(dir.bytes)
  offset+=local.bytes.length+data.length
 }
 const centralSize=central.reduce((n,c)=>n+c.length,0)
 if(offset+centralSize>0xffffffff)throw new Error('Backup is too large for ZIP format')
 const end=chunk(22)
 end.view.setUint32(0,0x06054b50,true)
 end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true)
 end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true)
 const total=offset+centralSize+end.bytes.length
 const out=new Uint8Array(total);let pos=0
 for(const part of [...contents,...central,end.bytes]){out.set(part,pos);pos+=part.length}
 return out
}
