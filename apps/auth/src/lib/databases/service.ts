import { createHash, randomBytes } from "node:crypto";
import { databaseCommand, publicBinding, runtimeOrigin, type RuntimeAccess } from "@webdock/database-contracts";
import { HostingError, type HostingActor } from "@webdock/hosting-contracts";
import { authorizeHosting, type Connection } from "../hosting/authorization";
import { encryptMailSecret, decryptMailSecret } from "../platform";

const fail = () => new HostingError(404, "Database access is unavailable.");
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const selection = `SELECT b.id,b.project_id AS "projectID",p.customer_id AS "customerID",b.name,b.environment,'postgresql' AS engine,g.profile
 FROM webdock_auth.database_binding b JOIN webdock_admin.projects p ON p.id=b.project_id
 LEFT JOIN webdock_auth.database_grant g ON g.binding_id=b.id AND g.subject=$1 AND g.enabled
 WHERE b.enabled AND p.status='active'`;

async function binding(db: Connection, actor: HostingActor, id: string, operator = false) {
  if (actor.source !== "studio") throw fail();
  const row = (await db.query(selection + " AND b.id=$2", [actor.subject, id])).rows[0];
  if (!row) throw fail();
  const authorization = await authorizeHosting(actor, { projectID: row.projectID, live: true, operator }, db);
  if (!operator && !row.profile) throw fail();
  return { row, authorization };
}

async function audit(db: Connection, actor: HostingActor, action: string, bindingID: string) {
  await db.query("INSERT INTO webdock_auth.database_audit(subject,action,binding_id) VALUES($1,$2,$3)", [actor.subject, action, bindingID]);
}

export async function executeDatabase(db: Connection, actor: HostingActor, input: unknown): Promise<unknown> {
  if (actor.source !== "studio") throw fail();
  const cmd = databaseCommand.parse(input);
  if (cmd.action === "list") {
    const auth = await authorizeHosting(actor, { customerID: cmd.customerID, live: true }, db);
    const rows = (await db.query(selection + " AND p.customer_id=$2 AND ($3::boolean OR g.id IS NOT NULL) ORDER BY b.name,b.id LIMIT 200", [actor.subject, cmd.customerID, auth.operator])).rows;
    const projects = auth.operator ? (await db.query("SELECT id,name FROM webdock_admin.projects WHERE customer_id=$1 AND status='active' ORDER BY name LIMIT 200", [cmd.customerID])).rows : [];
    const people = auth.operator ? (await db.query(`SELECT u.id,u.name,u.email FROM webdock_auth."user" u WHERE NOT COALESCE(u.banned,false) AND
      (u.role='operator' OR EXISTS(SELECT 1 FROM webdock_auth.member m JOIN webdock_auth.tenant_customer t ON t.organization_id=m."organizationId"
       WHERE m."userId"=u.id AND t.customer_id=$1)) ORDER BY u.name LIMIT 200`, [cmd.customerID])).rows : [];
    return { bindings: rows.map(row => publicBinding.parse(row)), operator: auth.operator, projects, people };
  }
  if (cmd.action === "create") {
    await authorizeHosting(actor, { projectID: cmd.projectID, operator: true, write: true }, db);
    const row = (await db.query("INSERT INTO webdock_auth.database_binding(project_id,name,environment) VALUES($1,$2,$3) RETURNING id", [cmd.projectID, cmd.name, cmd.environment])).rows[0];
    await audit(db, actor, "binding.create", row.id);
    return { id: row.id };
  }
  const management = ["grant", "revoke", "disable"].includes(cmd.action);
  const { row } = await binding(db, actor, cmd.bindingID, management);
  if (cmd.action === "get") return publicBinding.parse(row);
  if (cmd.action === "grant") {
    const user = (await db.query(`SELECT u.id FROM webdock_auth."user" u
      WHERE u.id=$1 AND NOT COALESCE(u.banned,false) AND (u.role='operator' OR EXISTS(
       SELECT 1 FROM webdock_auth.member m JOIN webdock_auth.tenant_customer t ON t.organization_id=m."organizationId"
       WHERE m."userId"=u.id AND t.customer_id=$2))`, [cmd.subject, row.customerID])).rows[0];
    if (!user) throw fail();
    const old = (await db.query("SELECT profile,runtime_origin FROM webdock_auth.database_grant WHERE binding_id=$1 AND subject=$2 FOR UPDATE", [cmd.bindingID, cmd.subject])).rows[0];
    if (old && old.profile !== cmd.profile && old.runtime_origin === cmd.runtimeOrigin) {
      throw new HostingError(409, "Changing database privileges requires a newly isolated runtime.");
    }
    const occupied = (await db.query("SELECT id FROM webdock_auth.database_grant WHERE runtime_origin=$1 AND NOT(binding_id=$2 AND subject=$3)", [cmd.runtimeOrigin, cmd.bindingID, cmd.subject])).rows[0];
    if (occupied) throw new HostingError(409, "This runtime is already assigned to another database user.");
    const claimed = (await db.query(`INSERT INTO webdock_auth.database_runtime_owner(runtime_origin,binding_id,subject,profile) VALUES($1,$2,$3,$4)
      ON CONFLICT(runtime_origin) DO UPDATE SET runtime_origin=EXCLUDED.runtime_origin
      WHERE database_runtime_owner.binding_id=EXCLUDED.binding_id AND database_runtime_owner.subject=EXCLUDED.subject AND database_runtime_owner.profile=EXCLUDED.profile
      RETURNING runtime_origin`, [cmd.runtimeOrigin, cmd.bindingID, cmd.subject, cmd.profile])).rows[0];
    if (!claimed) throw new HostingError(409, "This runtime is already assigned to another database user.");
    const secret = encryptMailSecret(cmd.proxySecret, `database:${cmd.bindingID}:${cmd.subject}`);
    await db.query(`INSERT INTO webdock_auth.database_grant(binding_id,subject,profile,runtime_origin,connection_id,secret_sealed)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(binding_id,subject) DO UPDATE SET profile=EXCLUDED.profile,
      runtime_origin=EXCLUDED.runtime_origin,connection_id=EXCLUDED.connection_id,secret_sealed=EXCLUDED.secret_sealed,
      revision=database_grant.revision+1,enabled=true`, [cmd.bindingID, cmd.subject, cmd.profile, cmd.runtimeOrigin, cmd.connectionID, secret]);
    await audit(db, actor, "grant.configure", cmd.bindingID);
    return { ok: true };
  }
  if (cmd.action === "revoke") {
    await db.query("UPDATE webdock_auth.database_grant SET enabled=false,revision=revision+1 WHERE binding_id=$1 AND subject=$2", [cmd.bindingID, cmd.subject]);
  } else if (cmd.action === "disable") {
    await db.query("UPDATE webdock_auth.database_binding SET enabled=false WHERE id=$1", [cmd.bindingID]);
    await db.query("UPDATE webdock_auth.database_grant SET enabled=false,revision=revision+1 WHERE binding_id=$1", [cmd.bindingID]);
  } else if (cmd.action === "open") {
    const origin = runtimeOrigin.safeParse(process.env.WEBDOCK_DATABASE_GATEWAY_ORIGIN);
    if (!origin.success) throw new HostingError(503, "Database gateway is not configured.");
    const code = token();
    const launch = (await db.query(`INSERT INTO webdock_auth.database_launch(token_hash,grant_id,grant_revision,session_id,expires_at)
      SELECT $1,id,revision,$2,now()+interval '60 seconds' FROM webdock_auth.database_grant
      WHERE binding_id=$3 AND subject=$4 AND enabled RETURNING expires_at`, [hash(code), actor.sessionID, cmd.bindingID, actor.subject])).rows[0];
    if (!launch) throw fail();
    await audit(db, actor, "session.launch", cmd.bindingID);
    return { code, gatewayOrigin: origin.data, binding: publicBinding.parse(row), expiresAt: new Date(launch.expires_at).toISOString() };
  }
  await audit(db, actor, cmd.action, cmd.bindingID);
  return { ok: true };
}

async function authorizeGrant(db: Connection, grantID: string, revision: number, sessionID: string) {
  const grant = (await db.query(`SELECT g.*,b.project_id FROM webdock_auth.database_grant g
    JOIN webdock_auth.database_binding b ON b.id=g.binding_id JOIN webdock_auth.session s ON s.id=$3 AND s."userId"=g.subject
    WHERE g.id=$1 AND g.revision=$2 AND g.enabled AND b.enabled FOR SHARE OF g,b,s`, [grantID, revision, sessionID])).rows[0];
  if (!grant) throw fail();
  await authorizeHosting({ subject: grant.subject, sessionID, source: "studio", scopes: ["hosting:read"] }, { projectID: grant.project_id, live: true }, db);
  return grant;
}

export async function exchangeLaunch(db: Connection, code: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw fail();
  const launch = (await db.query(`UPDATE webdock_auth.database_launch SET consumed_at=now()
    WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING *`, [hash(code)])).rows[0];
  if (!launch) throw fail();
  await authorizeGrant(db, launch.grant_id, launch.grant_revision, launch.session_id);
  const sessionToken = token();
  const session = (await db.query(`INSERT INTO webdock_auth.database_session(token_hash,grant_id,grant_revision,session_id,expires_at)
    VALUES($1,$2,$3,$4,now()+interval '15 minutes') RETURNING id,expires_at`, [hash(sessionToken), launch.grant_id, launch.grant_revision, launch.session_id])).rows[0];
  return { token: sessionToken, scopeID: session.id, expiresAt: new Date(session.expires_at).toISOString() };
}

export async function inspectSession(db: Connection, sessionToken: string): Promise<RuntimeAccess> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) throw fail();
  const session = (await db.query("SELECT * FROM webdock_auth.database_session WHERE token_hash=$1 AND expires_at>now()", [hash(sessionToken)])).rows[0];
  if (!session) throw fail();
  const grant = await authorizeGrant(db, session.grant_id, session.grant_revision, session.session_id);
  return { scopeID: session.id, subject: grant.subject, connectionID: grant.connection_id, profile: grant.profile,
    runtimeOrigin: runtimeOrigin.parse(grant.runtime_origin),
    proxySecret: decryptMailSecret<string>(grant.secret_sealed, `database:${grant.binding_id}:${grant.subject}`),
    expiresAt: new Date(session.expires_at).toISOString() };
}
