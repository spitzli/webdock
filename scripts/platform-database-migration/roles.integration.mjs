import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { prepareRoles } from './roles.mjs';
const enabled=process.env.RUN_ROLE_BOOTSTRAP_INTEGRATION==='1';
test('isolated PostgreSQL 18 root bootstrap permits restricted installer and cleanup', {skip:!enabled,timeout:120000},async()=>{
 const name=`wd-role-bootstrap-${process.pid}`;
 const docker=(args,input)=>execFileSync('docker',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']});
 const psql=(sql,db='wd_migration_test_roles')=>docker(['exec','-i',name,'psql','-X','-q','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],sql);
 let offline;
 try{
  docker(['run','-d','--name',name,'-e','POSTGRES_PASSWORD=isolated-local-root','-p','127.0.0.1::5432','postgres:18.6']);
  for(let attempt=0;;attempt++){
   try{docker(['exec',name,'pg_isready','-U','postgres']);break;}catch{if(attempt>=50)throw Error('Local PostgreSQL did not start');await new Promise(resolve=>setTimeout(resolve,100));}
  }
  psql('CREATE ROLE wd_migration_owner_roles NOLOGIN; CREATE ROLE wd_migration_app_roles LOGIN; CREATE ROLE wd_old_migrate NOLOGIN; CREATE DATABASE wd_migration_test_roles OWNER wd_migration_owner_roles;','postgres');
  psql('CREATE SCHEMA webdock_auth AUTHORIZATION wd_old_migrate; GRANT USAGE ON SCHEMA webdock_auth TO wd_migration_app_roles; CREATE SCHEMA app AUTHORIZATION wd_old_migrate; GRANT USAGE ON SCHEMA app TO wd_migration_app_roles;');
  const port=Number(docker(['port',name,'5432/tcp']).trim().split(':').at(-1));
  const generated=prepareRoles({fixture:true,host:'127.0.0.1',port,database:'wd_migration_test_roles',owner:'wd_migration_owner_roles',oldApp:'wd_migration_app_roles'});
  psql('CREATE TABLE webdock_auth.must_be_empty(id integer);');
  assert.throws(()=>psql(generated.bootstrap),/Selected restore schemas must be empty/);
  psql('DROP TABLE webdock_auth.must_be_empty;');
  psql(generated.bootstrap);
  assert.throws(()=>psql(generated.bootstrap),/Bootstrap roles already exist/);
  assert.throws(()=>psql(generated.bootstrap,'postgres'),/Wrong bootstrap database/);
  offline=new pg.Client({connectionString:generated.credentials.roles.webdock_offline_migrate.url});
  offline.on('error',()=>{});
  await offline.connect();
  const identity=(await offline.query('SELECT rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
  assert.deepEqual(identity,{rolsuper:false,rolbypassrls:false,rolcreaterole:true});
  const ownership=(await offline.query("SELECT DISTINCT r.rolname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='webdock_rls'")).rows;
  assert.deepEqual(ownership,[{rolname:'webdock_policy_owner'}]);
  // This REVOKE failed before extension member ownership was transferred by root.
  await offline.query('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA webdock_rls FROM PUBLIC');
  await offline.query('CREATE TABLE webdock_rls.context_key(id boolean PRIMARY KEY DEFAULT true CHECK(id),secret text NOT NULL); ALTER TABLE webdock_rls.context_key OWNER TO webdock_policy_owner; REVOKE ALL ON webdock_rls.context_key FROM PUBLIC;');
  await offline.query('INSERT INTO webdock_rls.context_key(secret) VALUES($1)',[generated.credentials.contextSecret]);
  assert.equal((await offline.query("SELECT length(encode(webdock_rls.hmac('test',secret,'sha256'),'hex')) AS len FROM webdock_rls.context_key")).rows[0].len,64);
  await offline.query('CREATE TABLE webdock_auth.restore_probe(id integer); ALTER TABLE webdock_auth.restore_probe OWNER TO webdock_platform_owner; CREATE TYPE webdock_auth.retained_enum AS ENUM (\'retained\');');
  await offline.query("ALTER ROLE webdock_auth_runtime IN DATABASE wd_migration_test_roles SET search_path=webdock_auth,pg_catalog");
  const usage=(await offline.query("SELECT has_schema_privilege('wd_migration_app_roles','webdock_auth','USAGE') AS platform,has_schema_privilege('wd_migration_app_roles','app','USAGE') AS app")).rows[0];
  assert.deepEqual(usage,{platform:false,app:true});
  const runtime=new pg.Client({connectionString:generated.credentials.roles.webdock_runtime.url});
  try{await runtime.connect();await assert.rejects(runtime.query('SELECT secret FROM webdock_rls.context_key'),/permission denied/);}finally{await runtime.end();}
  psql(generated.cleanup);
  await assert.rejects(offline.query('SELECT 1'));
  const result=psql("SELECT rolcanlogin,rolcreaterole,(SELECT count(*) FROM pg_auth_members WHERE member='webdock_offline_migrate'::regrole) AS memberships FROM pg_roles WHERE rolname='webdock_offline_migrate'; SELECT 1 FROM pg_type WHERE typname='retained_enum';");
  assert.match(result,/f\s*\| f\s*\|\s*0/);
  assert.match(result,/\(1 row\)/);
  const retry=new pg.Client({connectionString:generated.credentials.roles.webdock_offline_migrate.url});
  await assert.rejects(retry.connect());await retry.end();
 }finally{await offline?.end().catch(()=>{});try{docker(['rm','-f',name]);}catch{}}
});
