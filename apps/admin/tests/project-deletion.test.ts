import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import { sealData } from 'iron-session';
import { Pool } from 'pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { deleteProject, previewProjectDeletion } from '../src/lib/project-deletion';
import { managedDatabase, inspectManagedDatabase } from '../src/lib/project-deletion-database';
import { handleRegistryRequest } from '../src/lib/registry-api';
import { createRegistryMCP } from '../src/lib/mcp-server';
import { closeSnowflakePool } from '../src/lib/snowflake';
import type { RegistryActor } from '../src/lib/registry';

// All SQL and network calls are simulated. This suite never connects to a database.
const projectID = '101', schema = 'demo_deletion_fixture', cookieSecret = 'fixture-cookie-secret-at-least-thirty-two-characters';
const databaseURL = `postgresql://${schema}_runtime:fixture-password@fixture.neon.tech/db?sslmode=verify-full`;
const status = (expected: number) => (error: unknown) => !!error && typeof error === 'object' && 'status' in error && error.status === expected;
async function fixture(t: TestContext) {
  const env = { NEXT_PUBLIC_SERVER_URL: 'https://studio.webdock.dev', WEBDOCK_AUTH_ISSUER: 'https://auth.webdock.dev/api/auth', WEBDOCK_SSO_CLIENT_ID: 'fixture', WEBDOCK_SSO_CLIENT_SECRET: 'fixture', WEBDOCK_VERCEL_CLIENT_ID: 'fixture', WEBDOCK_VERCEL_CLIENT_SECRET: 'fixture', WEBDOCK_VERCEL_INTEGRATION_SLUG: 'fixture', WEBDOCK_VERCEL_TEAM_ID: 'team_fixture', WEBDOCK_VERCEL_TEAM_SLUG: 'fixture', WEBDOCK_SSO_COOKIE_SECRET: cookieSecret, WEBDOCK_MANAGED_DATABASES: JSON.stringify({ [schema]: { url: databaseURL } }) };
  const previous = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(async () => { await closeSnowflakePool(); for (const [k,v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const events: string[] = [];
  const project = { id: projectID, name: 'Fixture website', customer: '201', url: 'https://deletion-fixture.webdock.dev' };
  const instance = { id: '301', project: projectID, schemaName: schema, adminURL: 'https://studio.webdock.dev/sites/401', provider: 'vercel', providerProjectID: 'prj_fixture' };
  const identity = { bindingID: '401', customerID: '201', origin: project.url, clientID: '701', organizationID: '801', label: project.name, planHash: 'a'.repeat(64), alreadyRemoved: false };
  const encrypted = await sealData({ kind: 'vercel-credential', accessToken: 'fixture-token', teamID: 'team_fixture', configurationID: 'icfg_fixture' }, { password: createHash('sha256').update('webdock:vercel:stored-credential:' + cookieSecret).digest('hex'), ttl: 0 });
  let job: Record<string, any> | undefined;
  const state = { fail: '', shared: false, sharedLink: false, sharedLinkAfterLock: false, owner: `${schema}_runtime`, dependencies: false, absent: false };
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith('LOCK TABLE') && state.sharedLinkAfterLock) state.sharedLink = true;
    if (sql.startsWith('SELECT project_id FROM webdock_admin.vercel_project_link WHERE team_id=')) return { rows: state.sharedLink ? [{ project_id: '999' }] : [] };
    if (sql.startsWith('SELECT encrypted_token')) return { rows: [{ encrypted_token: encrypted }] };
    if (sql.startsWith('SELECT vercel_project_id')) return { rows: [{ vercel_project_id: instance.providerProjectID }] };
    if (sql.startsWith('SELECT') && sql.includes('project_deletion')) return { rows: job ? [structuredClone(job)] : [] };
    if (sql.startsWith('INSERT INTO webdock_admin.project_deletion') && !job) job = { plan: JSON.parse(args[1] as string), plan_hash: args[2], completed_steps: [], status: 'prepared' };
    if (sql.startsWith('UPDATE webdock_admin.project_deletion')) { job!.completed_steps = JSON.parse(args[1] as string); job!.status = sql.includes("status='deleted'") ? 'deleted' : 'stopped'; if (sql.includes('jsonb_set')) job!.plan.name = args[2]; }
    if (sql.startsWith('DELETE FROM')) events.push(sql.includes('cms_instances') ? 'inventory-instance' : 'inventory-project');
    if (sql.startsWith('INSERT INTO webdock_admin.audit_events')) events.push('audit');
    return { rows: [], rowCount: 0 };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const actor = { accessToken: 'fixture-access', user: { id: '501', collection: 'users', role: 'operator' }, payload: { db: { pool }, findByID: async () => structuredClone(project), count: async () => ({ totalDocs: state.shared ? 1 : 0 }), find: async ({ collection }: { collection: string }) => ({ docs: collection === 'users' ? [actor.user] : [structuredClone(instance)] }) } } as unknown as RegistryActor;
  t.mock.method(Pool.prototype, 'connect', async function(this: Pool) {
    assert.equal(this.options.connectionString, databaseURL);
    return { release() {}, query: async (sql: string) => {
      if (sql.startsWith('SELECT r.rolname')) return { rows: [{ rolname: `${schema}_runtime`, rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false, memberships: false, database_create: false, other_schema_write: false }] };
      if (sql.startsWith('SELECT n.oid')) return { rows: state.absent ? [] : [{ oid: 123, owner: state.owner, actor: `${schema}_runtime` }] };
      if (sql.includes('aclexplode')) return { rows: [], rowCount: 0 };
      if (sql.startsWith('WITH RECURSIVE')) return { rows: state.dependencies ? [{ schema: 'another_app' }] : [], rowCount: state.dependencies ? 1 : 0 };
      if (sql.startsWith('DROP SCHEMA')) { events.push('database'); if (state.fail === 'database') throw Error('simulated scoped database failure'); }
      return { rows: [], rowCount: 0 };
    } };
  });
  t.mock.method(Pool.prototype, 'query', async (sql: string) => { assert.equal(sql, 'SELECT webdock_admin.next_snowflake() AS id'); return { rows: [{ id: '601' }] }; });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === 'auth.webdock.dev') {
      const body = JSON.parse(init!.body as string);
      if (body.operation === 'delete') { events.push('identity'); if (state.fail === 'identity') return Response.json({ error: 'simulated identity failure' }, { status: 503 }); }
      return Response.json(identity);
    }
    assert.equal(url.hostname, 'api.vercel.com');
    if (init?.method === 'DELETE') { events.push('hosting'); if (state.fail === 'hosting') return new Response(null, { status: 403 }); return new Response(null, { status: 204 }); }
    if (url.pathname.endsWith('/domains')) return Response.json({ domains: [{ name: new URL(project.url).hostname, verified: true }] });
    if (url.pathname === '/v7/deployments') return Response.json({ deployments: [] });
    return Response.json({ id: 'prj_fixture', accountId: 'team_fixture', name: 'fixture' });
  });
  return { actor, project, instance, identity, state, events, job: () => job };
}

test('deletion service rejects tenant admins and missing administrator credentials before accessing data', async () => {
  for (const actor of [{ user: { collection: 'users', role: 'admin' }, accessToken: 'fixture' }, { user: { collection: 'users', role: 'operator' } }]) {
    await assert.rejects(previewProjectDeletion(actor as RegistryActor, projectID), status(403));
    await assert.rejects(deleteProject(actor as RegistryActor, projectID, {}), status(403));
  }
});

test('REST deletion rejects read scope and tenant admin; MCP omits destructive tool for read-only clients', async t => {
  const f = await fixture(t);
  for (const [role, scopes] of [['operator', ['webdock:read']], ['admin', ['webdock:read', 'webdock:write']]] as const) {
    f.actor.user.role = role;
    const response = await handleRegistryRequest(new Request('https://studio.webdock.dev/api/registry/projects/101', { method: 'DELETE', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: '{}' }), ['projects', projectID], { getCMS: async () => f.actor.payload, authenticate: async () => ({ subject: '501', scopes: new Set(scopes) }) });
    assert.equal(response.status, 403);
  }
  f.actor.user.role = 'operator';
  for (const write of [false, true]) {
    const server = createRegistryMCP(f.actor, write), client = new Client({ name: 'deletion-test', version: '1' });
    const [a,b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b);
    try { assert.equal((await client.listTools()).tools.some(tool => tool.name === 'delete_project'), write); if (!write) assert.equal((await client.callTool({ name: 'delete_project', arguments: { projectID, confirmName: 'Fixture website', planHash: 'a'.repeat(64) } })).isError, true); }
    finally { await client.close(); await server.close(); }
  }
  assert.deepEqual(f.events, []);
});

test('wrong confirmation, stale hash and changed mapping block every destructive phase', async t => {
  const f = await fixture(t), preview = await previewProjectDeletion(f.actor, projectID);
  for (const input of [{ confirmName: 'Wrong website', planHash: preview.planHash }, { confirmName: f.project.name, planHash: 'b'.repeat(64) }]) await assert.rejects(deleteProject(f.actor, projectID, input), status(409));
  f.project.name = 'Changed website';
  await assert.rejects(deleteProject(f.actor, projectID, { confirmName: preview.plan.name, planHash: preview.planHash }), status(409));
  assert.deepEqual(f.events, []);
});

for (const phase of ['hosting', 'identity', 'database']) test(`failure at ${phase} preserves inventory and retry resumes recorded progress`, async t => {
  const f = await fixture(t), preview = await previewProjectDeletion(f.actor, projectID);
  const input = { confirmName: preview.plan.name, planHash: preview.planHash };
  f.state.fail = phase;
  await assert.rejects(deleteProject(f.actor, projectID, input));
  assert.equal(f.job()!.status, 'stopped');
  assert.ok(!f.events.some(event => event.startsWith('inventory')));
  assert.deepEqual(f.job()!.completed_steps, phase === 'hosting' ? [] : phase === 'identity' ? ['hosting'] : ['hosting', 'identity']);
  f.state.fail = ''; f.events.length = 0;
  const result = await deleteProject(f.actor, projectID, input);
  assert.equal(result.status, 'deleted');
  assert.deepEqual(f.events, [...(phase === 'hosting' ? ['hosting'] : []), ...(phase !== 'database' ? ['identity'] : []), 'database', 'inventory-instance', 'inventory-project', 'audit']);
  f.events.length = 0;
  assert.equal((await deleteProject(f.actor, projectID, input)).alreadyDeleted, true);
  assert.deepEqual(f.events, []);
});

test('database deletion rejects unsafe credentials, shared dependencies and mismatched ownership', async t => {
  const f = await fixture(t);
  for (const badSchema of ['webdock_admin', 'public', 'demo_x";DROP SCHEMA public']) assert.throws(() => managedDatabase(badSchema), status(409));
  for (const url of [databaseURL.replace(`${schema}_runtime`, 'owner'), databaseURL.replace('fixture.neon.tech', 'localhost'), databaseURL.replace('verify-full', 'require')]) assert.throws(() => managedDatabase(schema, JSON.stringify({ [schema]: { url } })), status(409));
  f.state.owner = 'owner'; await assert.rejects(inspectManagedDatabase(schema, true), status(409));
  f.state.owner = `${schema}_runtime`; f.state.dependencies = true; await assert.rejects(inspectManagedDatabase(schema, true), status(409));
  assert.deepEqual(f.events, []);
  f.state.dependencies = false; f.state.absent = true;
  await assert.rejects(inspectManagedDatabase(schema), status(409));
  assert.equal((await inspectManagedDatabase(schema, true, true)).alreadyAbsent, true);
});


test('shared resources and invalid identity responses fail closed during preview', async t => {
  const f = await fixture(t);
  f.state.shared = true;
  await assert.rejects(previewProjectDeletion(f.actor, projectID), status(409));
  f.state.shared = false;
  f.identity.customerID = '999';
  await assert.rejects(previewProjectDeletion(f.actor, projectID), status(502));
  assert.deepEqual(f.events, []);
});

test('stopped job revalidates database dependencies and registry mapping before resuming', async t => {
  const f = await fixture(t), preview = await previewProjectDeletion(f.actor, projectID);
  const input = { confirmName: preview.plan.name, planHash: preview.planHash };
  f.state.fail = 'hosting';
  await assert.rejects(deleteProject(f.actor, projectID, input));
  f.state.fail = ''; f.events.length = 0; f.state.dependencies = true;
  await assert.rejects(deleteProject(f.actor, projectID, input), status(409));
  assert.deepEqual(f.events, []);
  f.state.dependencies = false; f.instance.schemaName = 'demo_other_fixture';
  await assert.rejects(deleteProject(f.actor, projectID, input), status(409));
  assert.deepEqual(f.events, []);
});


test('another project hosting link without a CMS blocks preview and locked deletion', async t => {
  const f = await fixture(t);
  f.state.sharedLink = true;
  await assert.rejects(previewProjectDeletion(f.actor, projectID), status(409));
  assert.deepEqual(f.events, []);
  f.state.sharedLink = false;
  const preview = await previewProjectDeletion(f.actor, projectID);
  f.state.sharedLinkAfterLock = true;
  await assert.rejects(deleteProject(f.actor, projectID, { confirmName: preview.plan.name, planHash: preview.planHash }), status(409));
  assert.equal(f.state.sharedLink, true);
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.job()!.completed_steps, []);
});

for (const rename of [false, true]) test(`stopped job tolerates metadata changes${rename ? ' but requires current name after rename' : ''}`, async t => {
  const f = await fixture(t), preview = await previewProjectDeletion(f.actor, projectID);
  const input = { confirmName: preview.plan.name, planHash: preview.planHash };
  f.state.fail = 'identity';
  await assert.rejects(deleteProject(f.actor, projectID, input));
  f.events.length = 0; f.state.fail = '';
  Object.assign(f.project, { notes: 'Operator revised notes', status: 'archived', updatedAt: '2026-10-06T12:00:00Z' });
  Object.assign(f.instance, { notes: 'Updated connection notes', status: 'retired', updatedAt: '2026-10-06T12:00:00Z' });
  f.identity.label = 'Updated binding label';
  if (rename) f.project.name = 'Renamed fixture website';
  const refreshed = await previewProjectDeletion(f.actor, projectID);
  assert.equal(refreshed.planHash, preview.planHash);
  assert.equal(refreshed.plan.name, f.project.name);
  if (rename) {
    await assert.rejects(deleteProject(f.actor, projectID, input), status(409));
    assert.deepEqual(f.events, []);
  }
  assert.equal((await deleteProject(f.actor, projectID, { ...input, confirmName: f.project.name })).status, 'deleted');
  assert.deepEqual(f.events, ['identity', 'database', 'inventory-instance', 'inventory-project', 'audit']);
  f.events.length = 0;
  assert.equal((await deleteProject(f.actor, projectID, { ...input, confirmName: f.project.name })).alreadyDeleted, true);
  assert.deepEqual(f.events, []);
});

for (const mapping of ['origin', 'schema']) test(`stopped job blocks changed ${mapping} even with a fresh preview`, async t => {
  const f = await fixture(t), preview = await previewProjectDeletion(f.actor, projectID);
  const input = { confirmName: preview.plan.name, planHash: preview.planHash };
  f.state.fail = 'identity';
  await assert.rejects(deleteProject(f.actor, projectID, input));
  f.state.fail = ''; f.events.length = 0;
  if (mapping === 'origin') f.project.url = 'https://another-fixture.webdock.dev';
  else f.instance.schemaName = 'demo_another_fixture';
  const refreshed = await previewProjectDeletion(f.actor, projectID);
  await assert.rejects(deleteProject(f.actor, projectID, { confirmName: refreshed.plan.name, planHash: refreshed.planHash }), status(409));
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.job()!.completed_steps, ['hosting']);
});
