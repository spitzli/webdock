import fs from 'node:fs';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
const schema=process.argv[2];
const paths={webdock:'../web',stall:'/home/newt/Projekte/Personal/spitzli-backup-roelfs-20261002/stall-eichenbruch'};
if(!paths[schema])throw Error('Choose webdock or stall; Spitzli importer includes its users.');
const env=parseEnv(fs.readFileSync(`${paths[schema]}/.env.instance`,'utf8'));
const pool=new Pool({connectionString:env.DATABASE_URL_UNPOOLED,max:1});
try{
 const who=(await pool.query('SELECT current_user,current_schema()')).rows[0];if(who.current_user!==`${schema}_runtime`||who.current_schema!==schema)throw Error('Wrong instance database role');
 const users=JSON.parse(fs.readFileSync(`.backups/${schema}-current.json`,'utf8')).users;
 const existing=(await pool.query(`SELECT id,email,role FROM "${schema}".users`)).rows;
 if(existing.length){if(existing.length!==users.length||users.some(u=>!existing.some(e=>e.id===u.id&&e.email===u.email&&e.role===u.role)))throw Error('Existing accounts differ; refusing overwrite');console.log('Existing imported accounts preserved.');}
 else{
  await pool.query('BEGIN');
  try{
   const columns=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='users'",[schema])).rows.map(c=>c.column_name);
   for(const user of users){
    if(!user.hash||!user.salt||!['operator','admin','editor','reader'].includes(user.role))throw Error('Incomplete exported account');
    const values={...user,name:user.name||user.email};const fields=['id','name','email','hash','salt','role'].filter(f=>columns.includes(f));
    await pool.query(`INSERT INTO "${schema}".users (${fields.map(f=>`"${f}"`).join(',')}) VALUES (${fields.map((_,i)=>`$${i+1}`).join(',')})`,fields.map(f=>values[f]));
   }
   await pool.query(`SELECT setval(pg_get_serial_sequence('"${schema}".users','id'),GREATEST((SELECT MAX(id) FROM "${schema}".users),1),true)`);
   await pool.query('COMMIT');
  }catch(e){await pool.query('ROLLBACK');throw e;}
  console.log(`${schema}: imported ${users.length} accounts with their existing password hashes; operator reserved.`);
 }
}finally{await pool.end();}
