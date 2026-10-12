import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rootCertificates } from 'node:tls';
import { parseEnv } from 'node:util';
import { prepareRoles, writeRoles } from './roles.mjs';
const fixture={fixture:true,host:'127.0.0.1',port:5432,database:'wd_migration_test_roles',owner:'wd_migration_owner_roles'};
test('generates guarded bootstrap and complete cleanup without SQL signing key',()=>{
 const result=prepareRoles(fixture);
 assert.equal(Object.keys(result.credentials.roles).length,11);
 assert.match(result.bootstrap,/current_database\(\).*wd_migration_test_roles/);
 assert.match(result.bootstrap,/webdock_offline_migrate.*CREATEROLE/);
 assert.match(result.bootstrap,/WITH ADMIN OPTION/);
 assert.match(result.bootstrap,/pg_depend/);
 assert.match(result.cleanup,/NOLOGIN NOCREATEROLE/);
 assert.match(result.cleanup,/pg_terminate_backend/);
 assert.doesNotMatch(result.cleanup,/^(DROP OWNED|DROP ROLE)/m);
 assert.ok(!result.bootstrap.includes(result.credentials.contextSecret));
 assert.ok(!result.cleanup.includes(result.credentials.contextSecret));
 const env=parseEnv(result.installerEnv);
 assert.equal(env.DATABASE_CONTEXT_SECRET,result.credentials.contextSecret);
 assert.equal(new URL(env.DATABASE_URL).username,'webdock_offline_migrate');
});
test('fixture identity and production CA fail closed',()=>{
 for(const change of [{host:'remote.example'},{database:'postgres'},{owner:'postgres'},{port:0},{host:'127.0.0.1?host=remote'}])assert.throws(()=>prepareRoles({...fixture,...change}));
 assert.throws(()=>prepareRoles({}));
});
test('outputs are exclusive and private, never rotated on rerun',()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'wd-role-generator-'));
 const output=path.join(parent,'private');
 try{writeRoles(fixture,output);assert.equal(fs.statSync(output).mode&0o777,0o700);
 for(const file of fs.readdirSync(output))assert.equal(fs.statSync(path.join(output,file)).mode&0o777,0o600);
 const old=fs.readFileSync(path.join(output,'credentials.json'),'utf8');
 assert.throws(()=>writeRoles(fixture,output));assert.equal(fs.readFileSync(path.join(output,'credentials.json'),'utf8'),old);
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});

test('production uses direct port 32000 and round-trips actual multiline CA',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'wd-role-ca-'));
 try{
  const caFile=path.join(directory,'ca.pem');fs.writeFileSync(caFile,rootCertificates[0]);
  const output=prepareRoles({caFile});const env=parseEnv(output.installerEnv);
  assert.equal(new URL(env.DATABASE_URL).port,'32000');
  assert.equal(env.DATABASE_CA_CERT,rootCertificates[0]);
  assert.equal(output.credentials.target.owner,'wd_owner_103217546714419200');
  assert.throws(()=>prepareRoles({caFile,port:5432}));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
