import {getPayload} from 'payload';
import config from '../src/payload.config';
const payload=await getPayload({config});
try {
 const users=await payload.count({collection:'users',overrideAccess:true});
 if(users.totalDocs===0){
  if(!process.env.BOOTSTRAP_EMAIL||!process.env.BOOTSTRAP_PASSWORD||process.env.BOOTSTRAP_PASSWORD.length<16)throw new Error('Strong bootstrap credentials required.');
  await payload.create({collection:'users',overrideAccess:true,data:{email:process.env.BOOTSTRAP_EMAIL,password:process.env.BOOTSTRAP_PASSWORD,name:'Dominik',role:'super-admin'}});
  console.log('Initial platform administrator created.');
 }else console.log('Existing users preserved.');
}finally{await payload.destroy();}
