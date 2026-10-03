import fs from 'node:fs';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {parseEnv} from 'node:util';
const pool=new Pool({connectionString:process.env.DATABASE_URL_UNPOOLED,max:1});
const central=parseEnv(fs.readFileSync('.env.local','utf8'));
const paths={webdock:'../web',spitzli:'../../../spitzli',stall:'/home/newt/Projekte/Personal/spitzli-backup-roelfs-20261002/stall-eichenbruch'};
try{
 const db=(await pool.query('SELECT current_database() AS name')).rows[0].name;
 await pool.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
 for(const [schema,dir]of Object.entries(paths)){
  const role=`${schema}_runtime`;
  const exists=(await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount;
  const file=`${dir}/.env.instance`;
  let env=fs.existsSync(file)?parseEnv(fs.readFileSync(file,'utf8')):{};
  if(exists&&!env.DATABASE_URL){const owned=(await pool.query('SELECT 1 FROM pg_namespace WHERE nspowner=(SELECT oid FROM pg_roles WHERE rolname=$1)',[role])).rowCount;if(owned)throw Error(`Role ${role} owns a schema but credentials are missing.`);}

  if(!env.DATABASE_URL){
   const password=crypto.randomBytes(40).toString('base64url');
   await pool.query(`${exists?'ALTER':'CREATE'} ROLE "${role}" PASSWORD '${password}' ${exists?'':'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT'}`);
   await pool.query(`GRANT "${role}" TO CURRENT_USER`);
   await pool.query(`CREATE SCHEMA "${schema}" AUTHORIZATION "${role}"`);
   await pool.query(`REVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC`);
   await pool.query(`GRANT CONNECT ON DATABASE "${db.replaceAll('"','""')}" TO "${role}"`);
   await pool.query(`ALTER ROLE "${role}" IN DATABASE "${db.replaceAll('"','""')}" SET search_path TO "${schema}", pg_catalog`);
   const pooled=new URL(central.DATABASE_URL),direct=new URL(central.DATABASE_URL_UNPOOLED);for(const url of [pooled,direct]){url.username=role;url.password=password;url.searchParams.set('sslmode','verify-full');}
   env={DATABASE_URL:pooled.toString(),DATABASE_URL_UNPOOLED:direct.toString(),PAYLOAD_SECRET:crypto.randomBytes(48).toString('base64url'),OPERATOR_EMAIL:'dominik@spitzli.dev',INSTANCE_SCHEMA:schema,BLOB_READ_WRITE_TOKEN:central.BLOB_READ_WRITE_TOKEN};
   for(const key of ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_FROM'])env[key]=central[key];
   env.SMTP_PASS=central.SMTP_PASS;env.SMTP_PASSWORD=central.SMTP_PASS;
   env.SITE_URL=schema==='stall'?'https://www.stall-eichenbruch.de':`https://${schema==='spitzli'?'spitzli.dev':'webdock.dev'}`;env.NEXT_PUBLIC_SERVER_URL=env.SITE_URL;
   if(schema==='spitzli'){
    const old=parseEnv(fs.readFileSync('../../../spitzli/.env.migration-source','utf8'));
    for(const key of ['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_FROM','SMTP_PASSWORD','CONTACT_ENABLED','HCAPTCHA_SECRET','HCAPTCHA_SITE_KEY'])if(old[key]&&old[key]!=='[SENSITIVE]')env[key]=old[key];
   }
   fs.writeFileSync(file,Object.entries(env).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
  }
  const app=new Pool({connectionString:env.DATABASE_URL_UNPOOLED,max:1});
  try{
   const owner=(await app.query('SELECT current_user, current_schema()')).rows[0];
   if(owner.current_user!==role||owner.current_schema!==schema)throw Error(`Wrong role/schema for ${schema}`);
   const permissions=(await app.query("SELECT nspname,has_schema_privilege(current_user,oid,'USAGE') AS access FROM pg_namespace WHERE nspname IN ('public','webdock','spitzli','stall')")).rows;
   if(permissions.some(row=>row.nspname!==schema&&row.access))throw Error(`Cross-schema access found for ${schema}`);
   console.log(`${role}: verified own schema ${schema}, no access to other instance/public schemas.`);
  }finally{await app.end();}
 }
}finally{await pool.end();}
