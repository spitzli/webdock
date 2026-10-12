#!/usr/bin/env node
/** Generate private SQL for root psql; this program never connects to a database. */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, X509Certificate } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const TARGET={host:'db-103217546630533120.pg.webdock.dev',port:32000,database:'db_103217546714419200',owner:'wd_owner_103217546714419200',oldApp:'wd_app_103217546714419200'};
const OWNERS=['webdock_platform_owner','webdock_policy_owner','webdock_website_owner'];
const LOGINS=['webdock_auth_bootstrap','webdock_auth_runtime','webdock_worker_runtime','webdock_admin_runtime','webdock_runtime','webdock_browser_website','webdock_cms_archive_runtime'];
const OFFLINE='webdock_offline_migrate';
const SCHEMAS=['public','webdock','webdock_admin','webdock_auth','webdock_mail'];
const q=s=>'"'+s.replaceAll('"','""')+'"';
const lit=s=>"'"+s.replaceAll("'","''")+"'";
function configuration(config){
 if(!config || Object.keys(config).some(key=>!['fixture','host','port','database','owner','oldApp','caFile'].includes(key)))throw Error('Unexpected role bootstrap configuration');
 let target;
 if(config.fixture===true){
  if(config.host!=='127.0.0.1'||!/^wd_migration_test_[a-z0-9_]+$/.test(config.database||'')||!/^wd_migration_owner_[a-z0-9_]+$/.test(config.owner||'')||!Number.isInteger(config.port)||config.port<1||config.port>65535)throw Error('Fixture requires exact loopback and dedicated database/owner');
  if(config.oldApp && !/^wd_migration_app_[a-z0-9_]+$/.test(config.oldApp))throw Error('Unexpected fixture app role');
  target={...config};
 }else{
  if(config.fixture!==undefined && config.fixture!==false)throw Error('Invalid fixture setting');
  for(const key of ['host','port','database','owner','oldApp'])if(config[key]!==undefined && config[key]!==TARGET[key])throw Error('Only the authorized production target is permitted');
  if(!config.caFile)throw Error('Production requires an explicit trusted CA file');
  target={...TARGET};
 }
 let ca='';
 if(config.caFile){
  ca=fs.readFileSync(config.caFile,'utf8');
  const certs=ca.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if(!certs?.length || ca.replace(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,'').trim())throw Error('Invalid CA PEM');
  for(const cert of certs)new X509Certificate(cert);
 }
 return {target,ca,fixture:config.fixture===true};
}
function identityGuard(target){return `DO $identity$ BEGIN
 IF current_database()<>${lit(target.database)} THEN RAISE EXCEPTION 'Wrong bootstrap database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper) THEN RAISE EXCEPTION 'Root bootstrap requires a superuser'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.oid=d.datdba WHERE d.datname=current_database() AND r.rolname=${lit(target.owner)}) THEN RAISE EXCEPTION 'Unexpected managed database owner'; END IF;
 IF current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999 THEN RAISE EXCEPTION 'PostgreSQL 18 required'; END IF;
END $identity$;`;}
export function prepareRoles(config){
 const {target,ca,fixture}=configuration(config);
 const contextSecret=randomBytes(48).toString('base64url');
 const roles=Object.fromEntries([...OWNERS,...LOGINS,OFFLINE].map(name=>[name,{login:!OWNERS.includes(name),...(OWNERS.includes(name)?{}:{password:randomBytes(36).toString('base64url')})}]));
 for(const [name,role] of Object.entries(roles))if(role.login){
  const url=new URL(`postgresql://${target.host}:${target.port}/${target.database}`);url.username=name;url.password=role.password;role.url=url.href;
 }
 const granted=[...OWNERS,...LOGINS,target.owner];
 const schemas=SCHEMAS.map(lit).join(',');
 const bootstrap=[
  '\\set ON_ERROR_STOP on','\\set QUIET on','BEGIN;',identityGuard(target),
  `DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=ANY(ARRAY[${Object.keys(roles).map(lit).join(',')}])) THEN RAISE EXCEPTION 'Bootstrap roles already exist; refusing password rotation'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY(ARRAY[${schemas}])) OR
 EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=ANY(ARRAY[${schemas}]) AND t.typtype IN ('e','d','c')) OR
 EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY(ARRAY[${schemas}])) THEN RAISE EXCEPTION 'Selected restore schemas must be empty before bootstrap'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='webdock_rls') OR EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname='pgcrypto') THEN RAISE EXCEPTION 'Policy schema or pgcrypto already exists; refusing ambiguous ownership'; END IF;
END $preflight$;`,
  ...OWNERS.map(role=>`CREATE ROLE ${q(role)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`),
  ...LOGINS.map(role=>`CREATE ROLE ${q(role)} LOGIN PASSWORD ${lit(roles[role].password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`),
  `CREATE ROLE ${q(OFFLINE)} LOGIN PASSWORD ${lit(roles[OFFLINE].password)} NOSUPERUSER NOCREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS;`,
  ...granted.map(role=>`GRANT ${q(role)} TO ${q(OFFLINE)} WITH ADMIN OPTION;`),
  'GRANT webdock_website_owner TO webdock_browser_website;',
  ...SCHEMAS.flatMap(schema=>[
   `CREATE SCHEMA IF NOT EXISTS ${q(schema)} AUTHORIZATION webdock_platform_owner; ALTER SCHEMA ${q(schema)} OWNER TO webdock_platform_owner;`,
   `REVOKE ALL ON SCHEMA ${q(schema)} FROM PUBLIC;`,
   ...(target.oldApp?[`DO $old_app$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${lit(target.oldApp)}) THEN EXECUTE ${lit(`REVOKE ALL ON SCHEMA ${q(schema)} FROM ${q(target.oldApp)}`)}; END IF; END $old_app$;`]:[])
  ]),
  'CREATE SCHEMA webdock_rls AUTHORIZATION webdock_policy_owner;',
  'CREATE EXTENSION pgcrypto WITH SCHEMA webdock_rls;',
  `DO $extension_owners$ DECLARE routine record; BEGIN
 FOR routine IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_depend d ON d.classid='pg_catalog.pg_proc'::regclass AND d.objid=p.oid JOIN pg_catalog.pg_extension e ON d.refclassid='pg_catalog.pg_extension'::regclass AND d.refobjid=e.oid WHERE e.extname='pgcrypto' AND d.deptype='e' LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO webdock_policy_owner',routine.signature);
 END LOOP;
END $extension_owners$;`,
  'REVOKE ALL ON SCHEMA webdock_rls FROM PUBLIC;',
  'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA webdock_rls FROM PUBLIC;',
  ...OWNERS.map(role=>`ALTER DEFAULT PRIVILEGES FOR ROLE ${q(role)} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`),
  'COMMIT;',''
 ].join('\n');
 const cleanup=[
  '\\set ON_ERROR_STOP on','\\set QUIET on','BEGIN;',identityGuard(target),
  `ALTER ROLE ${q(OFFLINE)} NOLOGIN NOCREATEROLE PASSWORD NULL;`,
  `SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE usename=${lit(OFFLINE)} AND pid<>pg_backend_pid();`,
  `DO $memberships$ DECLARE granted record; BEGIN
 FOR granted IN SELECT r.rolname,g.rolname AS grantor FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid JOIN pg_catalog.pg_roles g ON g.oid=m.grantor WHERE m.member=${lit(OFFLINE)}::regrole LOOP
 EXECUTE format('REVOKE %I FROM %I GRANTED BY %I CASCADE',granted.rolname,${lit(OFFLINE)},granted.grantor);
 END LOOP;
END $memberships$;`,
  'COMMIT;','-- Retain the disabled role: it may still own restored objects. Never DROP OWNED.',''
 ].join('\n');
 const env={DATABASE_URL:roles[OFFLINE].url,DATABASE_URL_UNPOOLED:roles[OFFLINE].url,MIGRATION_TARGET_HOST:target.host,MIGRATION_TARGET_DATABASE:target.database,DATABASE_CONTEXT_SECRET:contextSecret,DATABASE_RLS_SECRET:contextSecret,...(ca?{DATABASE_CA_CERT:ca}:{})};
 const installerEnv=Object.entries(env).map(([key,value])=>`${key}="${value}"`).join('\n')+'\n';
 return {bootstrap,cleanup,installerEnv,credentials:{target,fixture,contextSecret,roles}};
}
export function writeRoles(config,directory){
 const generated=prepareRoles(config);
 fs.mkdirSync(directory,{mode:0o700});
 const files={'bootstrap.sql':generated.bootstrap,'cleanup.sql':generated.cleanup,'installer.env':generated.installerEnv,'credentials.json':JSON.stringify(generated.credentials,null,2)+'\n'};
 for(const [name,value] of Object.entries(files))fs.writeFileSync(path.join(directory,name),value,{flag:'wx',mode:0o600});
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 try{
  const [configFile,directory,...extra]=process.argv.slice(2);
  if(!configFile||!directory||extra.length)throw Error('Usage: roles.mjs config.json NEW_PRIVATE_DIRECTORY');
  writeRoles(JSON.parse(fs.readFileSync(configFile,'utf8')),directory);
  console.log('Private root-bootstrap and cleanup artifacts prepared; no database changes made.');
 }catch{console.error('Role preparation failed closed; inspect the private configuration without printing credentials.');process.exitCode=1;}
}
