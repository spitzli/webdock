import {RequestError} from './model.ts';
export type Window={start:string;end:string};
export type Settings={timezone:'Europe/Berlin';notice:'Beispielzeiten – Demo';slotMinutes:15|30|60;capacity:number;weekly:Window[][];overrides:{date:string;closed:boolean;windows:Window[]}[]};
export type Appointment={date:string;time:string;durationMinutes:number;units:number;status:string};
export type Booking=Omit<Appointment,'status'>;
const bad=(message='Ungültige Kalendereinstellungen.'):never=>{throw new RequestError(message);};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
export function localDate(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function dateValid(v:unknown):v is string{return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
export function validateDate(v:unknown,now=new Date()){if(!dateValid(v)||v<localDate(now)||Date.parse(v)>Date.parse(localDate(now))+180*86400000)bad('Datum muss innerhalb der nächsten 180 Tage liegen.');return v as string;}
export function minutes(v:string,end=false){if(end&&v==='24:00')return 1440;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))return bad('Ungültige Uhrzeit.');return Number(v.slice(0,2))*60+Number(v.slice(3));}
const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function defaultSettings(features:readonly string[]):Settings{return {timezone:'Europe/Berlin',notice:'Beispielzeiten – Demo',slotMinutes:30,capacity:features.includes('appointment')?1:20,weekly:[[],...[1,2,3,4,5].map(()=>[{start:'09:00',end:'17:00'}]),[{start:'09:00',end:'13:00'}]],overrides:[]};}
function windows(v:unknown):Window[]{if(!Array.isArray(v)||v.length>2)bad();let end=0;return (v as unknown[]).map(w=>{if(!object(w)||!exact(w,['start','end'])||typeof w.start!=='string'||typeof w.end!=='string')bad();const value=w as Window;const a=minutes(value.start),b=minutes(value.end,true);if(a>=b||a<end||a%15||b%15)bad('Öffnungsfenster müssen geordnet, überschneidungsfrei und im 15-Minuten-Raster liegen.');end=b;return {...value};});}
export function validateSettings(raw:unknown):Settings{
 if(!object(raw)||!exact(raw,['timezone','notice','slotMinutes','capacity','weekly','overrides'])||raw.timezone!=='Europe/Berlin'||raw.notice!=='Beispielzeiten – Demo'||![15,30,60].includes(Number(raw.slotMinutes))||typeof raw.slotMinutes!=='number'||!Number.isInteger(raw.capacity)||Number(raw.capacity)<1||Number(raw.capacity)>100||!Array.isArray(raw.weekly)||raw.weekly.length!==7||!Array.isArray(raw.overrides)||raw.overrides.length>366)bad();
 const r=raw as unknown as Settings;const seen=new Set<string>();return {timezone:'Europe/Berlin',notice:'Beispielzeiten – Demo',slotMinutes:r.slotMinutes,capacity:r.capacity,weekly:r.weekly.map(windows),overrides:r.overrides.map(o=>{if(!object(o)||!exact(o,['date','closed','windows'])||!dateValid(o.date)||typeof o.closed!=='boolean'||seen.has(o.date))bad();seen.add(o.date);const ws=windows(o.windows);if(o.closed&&ws.length)bad();return {date:o.date,closed:o.closed,windows:ws};})};
}
export function dayWindows(s:Settings,date:string){const o=s.overrides.find(x=>x.date===date);return o?(o.closed?[]:o.windows):s.weekly[new Date(date+'T12:00:00Z').getUTCDay()];}
// A Berlin wall time must resolve exactly once. This rejects both DST gaps and folds.
export function instant(date:string,time:string):number|null{const wall=Date.parse(`${date}T${time}:00Z`);const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});const matches=[60,120].map(offset=>wall-offset*60000).filter(v=>formatter.format(new Date(v))===`${date} ${time}`);return matches.length===1?matches[0]:null;}
function safeInterval(date:string,start:number,end:number){for(let t=start;t<end;t+=15)if(instant(date,clock(t))===null)return false;return true;}
export function remaining(s:Settings,appointments:Appointment[],b:Booking){const a=minutes(b.time),end=a+b.durationMinutes;const rows=appointments.filter(x=>x.status==='active'&&x.date===b.date&&minutes(x.time)<end&&minutes(x.time)+x.durationMinutes>a);const points=[a,...rows.map(x=>minutes(x.time)).filter(x=>x>a&&x<end)];const peak=Math.max(0,...points.map(t=>rows.filter(x=>minutes(x.time)<=t&&minutes(x.time)+x.durationMinutes>t).reduce((n,x)=>n+x.units,0)));return s.capacity-peak;}
export function assertBooking(s:Settings,appointments:Appointment[],b:Booking,now=new Date(),checkFuture=true){
 if(checkFuture)validateDate(b.date,now);else if(!dateValid(b.date))bad();
 const start=minutes(b.time),end=start+b.durationMinutes;
 if(!Number.isInteger(b.durationMinutes)||b.durationMinutes<15||b.durationMinutes>720||b.durationMinutes%15||!Number.isInteger(b.units)||b.units<1||b.units>100||end>1440||!dayWindows(s,b.date).some(w=>start>=minutes(w.start)&&end<=minutes(w.end,true)&&(start-minutes(w.start))%s.slotMinutes===0)||!safeInterval(b.date,start,end))bad('Termin liegt außerhalb der buchbaren Öffnungszeiten.');
 const at=instant(b.date,b.time);if(at===null||(checkFuture&&at<=now.getTime()))bad('Bitte eine zukünftige, eindeutige Uhrzeit wählen.');
 if(remaining(s,appointments,b)<b.units)throw new RequestError('Dieser Termin ist nicht mehr verfügbar.',409);
}
export function availableSlots(s:Settings,appointments:Appointment[],date:string,units:number,now=new Date()){
 validateDate(date,now);if(!Number.isInteger(units)||units<1||units>100)bad('Ungültige Personenzahl.');const slots:{time:string;remaining:number}[]=[];
 for(const w of dayWindows(s,date))for(let start=minutes(w.start);start+s.slotMinutes<=minutes(w.end,true);start+=s.slotMinutes){const b={date,time:clock(start),durationMinutes:s.slotMinutes,units};try{assertBooking(s,appointments,b,now);slots.push({time:b.time,remaining:remaining(s,appointments,b)});}catch(e){if(!(e instanceof RequestError))throw e;}}
 return slots;
}
