import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet'
import { useEffect } from 'react'
import L from 'leaflet'
import type { Activity, Occurrence } from '../lib/types'
import { activityMarker } from '../lib/map-icons'
function Picker({ onPick }: {onPick:(lat:number,lng:number)=>void}) { useMapEvents({ click(e) { onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) } }); return null }
function FlyTo({center}: {center:[number,number]}) { const map=useMapEvents({}); useEffect(()=>{map.setView(center,Math.max(map.getZoom(),13))},[map,center[0],center[1]]); return null }
export default function ActivityMap({activities, occurrences, onSelect, pick, selected}: {activities:Activity[]; occurrences:Occurrence[]; onSelect?:(a:Activity)=>void;pick?:(lat:number,lng:number)=>void;selected?:[number,number]|null}) {
 const points=activities.filter(a=>a.lat!==null&&a.lng!==null)
 const center: [number,number] = selected || (points.length ? [points[0].lat!,points[0].lng!] : [60.45,22.27])
 return <div className="map-shell"><MapContainer center={center} zoom={points.length||selected?11:5} scrollWheelZoom={false} className="map-canvas">
  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
  {selected&&<FlyTo center={selected}/>}
  {pick && <Picker onPick={pick}/>}
  {points.map(a=><Marker key={a.id} position={[a.lat!,a.lng!]} icon={L.divIcon({className:'together-pin-wrapper',html:activityMarker(a,occurrences),iconSize:[42,50],iconAnchor:[21,50],popupAnchor:[0,-42]})}><Popup><strong>{a.title}</strong><br/>{a.location_label||'Pinned location'}<br/><small>{occurrences.some(o=>o.activity_id===a.id&&o.status==='completed')?'✓ Visited':occurrences.some(o=>o.activity_id===a.id&&o.starts_at)?'📅 Planned':'💡 Idea'}</small><br/>{onSelect&&<button className="link" onClick={()=>onSelect(a)}>Open activity</button>}</Popup></Marker>)}
  {selected&&<Marker position={selected} icon={L.divIcon({className:'together-pin-wrapper',html:'<span class="together-map-pin picked"><span class="pin-symbol">📍</span><span class="pin-badge">✓</span></span>',iconSize:[42,50],iconAnchor:[21,50]})}><Popup>Selected location</Popup></Marker>}
 </MapContainer></div>
}
