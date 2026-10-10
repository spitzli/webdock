import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,validateSettings,availableSlots,assertBooking,validateDate} from '../src/calendar.ts';
const now=new Date('2026-10-05T06:00:00Z');
test('opening windows, overlapping occupancy and cancellation',()=>{
 const s=defaultSettings(['reservation']);s.capacity=3;
 const bookings=[{date:'2026-10-05',time:'09:00',durationMinutes:60,units:2,status:'active'}];
 assert.equal(availableSlots(s,bookings,'2026-10-05',2,now).some(x=>x.time==='09:30'),false);
 assert.equal(availableSlots(s,bookings,'2026-10-05',1,now)[0].remaining,1);
 assert.equal(availableSlots(s,[{...bookings[0],status:'cancelled'}],'2026-10-05',3,now)[0].time,'09:00');
 assert.throws(()=>assertBooking(s,bookings,{date:'2026-10-05',time:'09:30',durationMinutes:30,units:2},now),/verfügbar/);
});
test('closed override, invalid windows/date and booking boundaries',()=>{
 const s=defaultSettings(['appointment']);s.overrides=[{date:'2026-10-05',closed:true,windows:[]}];
 assert.deepEqual(availableSlots(s,[],'2026-10-05',1,now),[]);
 assert.throws(()=>validateSettings({...s,weekly:[[{start:'09:00',end:'12:00'},{start:'11:00',end:'13:00'}],...s.weekly.slice(1)]}));
 assert.throws(()=>validateDate('2026-02-30',now));assert.throws(()=>validateDate('2027-10-05',now));
 assert.throws(()=>assertBooking(defaultSettings([]),[],{date:'2026-10-05',time:'16:45',durationMinutes:30,units:1},now));
});
test('Berlin future time and DST rejected early-night slot',()=>{
 const s=defaultSettings([]);s.weekly[0]=[{start:'01:00',end:'04:00'}];
 const slots=availableSlots(s,[],'2026-10-25',1,now);
 assert.equal(slots.some(x=>x.time.startsWith('02:')),false);
 assert.equal(availableSlots(defaultSettings([]),[],'2026-10-05',1,new Date('2026-10-05T07:15:00Z'))[0].time,'09:30');
});

test('capacity counts simultaneous occupancy, split openings, source immutability and invalid settings',()=>{
 const s=defaultSettings([]);s.capacity=2;
 const rows=[{date:'2026-10-05',time:'09:00',durationMinutes:30,units:1,status:'active'},{date:'2026-10-05',time:'09:30',durationMinutes:30,units:1,status:'active'}];
 assert.doesNotThrow(()=>assertBooking(s,rows,{date:'2026-10-05',time:'09:00',durationMinutes:60,units:1},now));
 s.weekly[1]=[{start:'09:00',end:'12:00'},{start:'14:00',end:'17:00'}];
 assert.equal(availableSlots(s,[],'2026-10-05',1,now).some(x=>x.time==='12:00'),false);
 assert.throws(()=>validateSettings({...s,capacity:0}));assert.throws(()=>validateSettings({...s,slotMinutes:45}));
 assert.throws(()=>validateSettings({...s,timezone:'UTC'}));
 assert.throws(()=>validateSettings({...s,overrides:[{date:'2026-10-05',closed:true,windows:[{start:'09:00',end:'10:00'}]}]}));
 assert.throws(()=>validateSettings({...s,overrides:[{date:'2026-10-05',closed:true,windows:[]},{date:'2026-10-05',closed:true,windows:[]}]}));
});
