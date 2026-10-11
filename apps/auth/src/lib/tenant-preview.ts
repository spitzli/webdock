import type { PoolClient } from 'pg';
import { database } from './db';
import { AccessError, websiteURL } from './access-management';
import { getTenant } from './tenants';
import { getTenantPlan } from './plans';
import { getTenantStorage } from './storage-usage';
import { getTenantMail } from './tenant-mail';
import { getTenantMailService } from './mail-service';
import { getPlatformSettings } from './platform';

export type PreviewActor = { userID: string; sessionID: string };
export type TenantPreview = { customerID: string; customerName: string; expiresAt: string; status: 'active' | 'expired'; readOnly: true; role: 'admin' };
type PreviewContext = { preview: TenantPreview; organizationID: string };
type Connection = Pick<PoolClient, 'query'>;
const denied = (): never => { throw new AccessError('Die Kundenansicht ist schreibgeschützt. Bitte zuerst die Vorschau verlassen.'); };
async function requireActor(actor: PreviewActor, connection: Connection = database, lock = false) {
 const result = await connection.query(`SELECT u.id FROM webdock_auth."user" u JOIN webdock_auth.session s ON s."userId"=u.id WHERE u.id=$1 AND s.id=$2 AND s."expiresAt">now() AND u.role='operator' AND NOT coalesce(u.banned,false) AND u."emailVerified" AND u."twoFactorEnabled" AND NOT u."mustChangePassword"${lock ? ' FOR SHARE OF u,s' : ''}`, [actor.userID, actor.sessionID]);
 if (!result.rowCount) throw new AccessError('Eine aktive Betreiber-Sitzung mit vollständiger Sicherheitskonfiguration ist erforderlich.');
}
export async function startTenantPreview(actor: PreviewActor, customerID: string): Promise<TenantPreview> {
 if (!/^[1-9][0-9]{0,18}$/.test(customerID)) throw new AccessError('Mandant nicht verfügbar.');
 const connection = await database.connect();
 try {
  await connection.query('BEGIN');
  await requireActor(actor, connection, true);
  // Runtime can read mappings but cannot update/lock that owner-managed table.
  // Lock customer status; each preview request revalidates the stored mapping.
  const tenant = (await connection.query(`SELECT c.id,c.name,t.organization_id FROM webdock_admin.customers c JOIN webdock_auth.tenant_customer t ON t.customer_id=c.id WHERE c.id=$1 AND c.status='active' FOR SHARE OF c`, [customerID])).rows[0];
  if (!tenant) throw new AccessError('Ein aktiver, zugeordneter Mandant ist erforderlich.');
  const created = (await connection.query(`INSERT INTO webdock_auth.studio_tenant_preview(session_id,actor_id,customer_id,organization_id) VALUES($1,$2,$3,$4) ON CONFLICT(session_id) DO NOTHING RETURNING expires_at`, [actor.sessionID, actor.userID, customerID, tenant.organization_id])).rows[0];
  if (!created) denied();
  await connection.query("INSERT INTO webdock_auth.access_event(actor_id,action,target_id,outcome) VALUES($1,'tenant-preview-start',$2,'succeeded')", [actor.userID, customerID]);
  await connection.query('COMMIT');
  return { customerID, customerName: tenant.name, expiresAt: created.expires_at.toISOString(), status: 'active', readOnly: true, role: 'admin' };
 } catch (error) { await connection.query('ROLLBACK'); throw error; }
 finally { connection.release(); }
}
export async function exitTenantPreview(actor: PreviewActor): Promise<{ message: string; customerID?: string }> {
 const connection = await database.connect();
 try {
  await connection.query('BEGIN');
  await requireActor(actor, connection, true);
  const previous = (await connection.query('DELETE FROM webdock_auth.studio_tenant_preview WHERE session_id=$1 AND actor_id=$2 RETURNING customer_id', [actor.sessionID, actor.userID])).rows[0];
  if (previous) await connection.query("INSERT INTO webdock_auth.access_event(actor_id,action,target_id,outcome) VALUES($1,'tenant-preview-exit',$2,'succeeded')", [actor.userID, previous.customer_id]);
  await connection.query('COMMIT');
  return { message: 'Kundenansicht beendet.', ...(previous ? { customerID: previous.customer_id } : {}) };
 } catch (error) { await connection.query('ROLLBACK'); throw error; }
 finally { connection.release(); }
}
export async function currentTenantPreview(actor: PreviewActor): Promise<PreviewContext | null> {
 const row = (await database.query(`SELECT p.*,c.name,c.status AS customer_status,t.organization_id AS current_organization,
 p.expires_at>now() AS unexpired FROM webdock_auth.studio_tenant_preview p
 JOIN webdock_admin.customers c ON c.id=p.customer_id
 LEFT JOIN webdock_auth.tenant_customer t ON t.customer_id=p.customer_id WHERE p.session_id=$1`, [actor.sessionID])).rows[0];
 if (!row) return null;
 await requireActor(actor);
 if (row.actor_id !== actor.userID) denied();
 const active = !row.expired_at && row.unexpired && row.customer_status === 'active' && row.current_organization === row.organization_id;
 if (!active) {
  // Persist invalidation: expiry/archive/remapping must never silently restore
  // operator permissions or revive a preview when the customer is reactivated.
  await database.query(`WITH expired AS (
   UPDATE webdock_auth.studio_tenant_preview SET expired_at=now() WHERE session_id=$1 AND actor_id=$2 AND expired_at IS NULL RETURNING customer_id
  ) INSERT INTO webdock_auth.access_event(actor_id,action,target_id,outcome) SELECT $2,'tenant-preview-expired',customer_id,'succeeded' FROM expired`, [actor.sessionID, actor.userID]);
 }
 return { organizationID: row.organization_id, preview: { customerID: row.customer_id, customerName: row.name, expiresAt: row.expires_at.toISOString(), status: active ? 'active' : 'expired', readOnly: true, role: 'admin' } };
}
async function previewSites(context: PreviewContext) {
 if (!(await getPlatformSettings()).cmsEnabled) return [];
 const rows = (await database.query(`SELECT b.id,b.label,c."redirectUris" FROM webdock_auth.app_binding b JOIN webdock_auth."oauthClient" c ON c."clientId"=b.client_id WHERE b.organization_id=$1 AND b.enabled AND NOT c.disabled ORDER BY b.label`, [context.organizationID])).rows;
 return rows.flatMap(row => { const url = websiteURL(row.redirectUris); return url ? [{ id: row.id as string, name: row.label as string, url, role: 'admin' as const }] : []; });
}
export async function dispatchTenantPreview(context: PreviewContext, operation: string, args: unknown[], headers: Headers) {
 if (context.preview.status !== 'active') throw new AccessError('Die Kundenansicht ist abgelaufen oder nicht mehr verfügbar. Bitte die Vorschau verlassen.');
 const { customerID, customerName } = context.preview;
 if (operation === 'listTenants') return [{ id: customerID, name: customerName, status: 'active', role: 'admin' }];
 if (operation === 'listTenantInvitations') return [];
 if (operation === 'accountSites') return previewSites(context);
 if (!['getTenant', 'getTenantPlan', 'getTenantStorage', 'getTenantMail', 'getTenantMailService'].includes(operation) || args[0] !== customerID) denied();
 if (operation === 'getTenantMailService') { const mail = await getTenantMailService(headers, customerID); return mail ? { ...mail, canActivate: false, canSuspend: false, canReconcile: false } : null; }
 if (operation === 'getTenantPlan') return getTenantPlan(headers, customerID);
 if (operation === 'getTenantStorage') return getTenantStorage(headers, customerID);
 // This read uses stored account/domain snapshots and a configured flag only;
 // credential listing and every provider-token operation remain excluded.
 if (operation === 'getTenantMail') return { ...await getTenantMail(headers, customerID), operator: false, canManage: false };
 const view = await getTenant(headers, customerID);
 return { ...view, tenant: { ...view.tenant, member_role: 'admin' }, operator: false, canManage: false, sites: await previewSites(context) };
}
