export function canApplyAccountResponse(currentId:string|null,requestId:string,currentEpoch:number,requestEpoch:number):boolean {
 return Boolean(requestId)&&currentId===requestId&&currentEpoch===requestEpoch
}
export function scopeStorageKey(userId:string):string{return `together-scopes-user-${userId}`}
/** Persisted filter IDs must belong to this account; global cross-user storage is ignored. */
export function readVisibleScopes(store:Pick<Storage,'getItem'>|null,key:string,groupIds:string[]):string[] {
 const allowed=new Set(['personal',...groupIds])
 try{
  const saved=store?.getItem(key)
  if(!saved)return [...allowed]
  const parsed:unknown=JSON.parse(saved)
  if(!Array.isArray(parsed))return [...allowed]
  return [...new Set(parsed.filter((x:unknown):x is string=>typeof x==='string'&&allowed.has(x)))]
 }catch{return [...allowed]}
}
