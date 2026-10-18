import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {MailServiceError} from './instances.ts';
type DB=Pick<PoolClient,'query'>;
export const outboxSchemaSQL=`
CREATE TABLE IF NOT EXISTS webdock_mail.send_job (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id text NOT NULL REFERENCES webdock_auth.tenant_customer(customer_id),
 source_id text NOT NULL,idempotency_key text NOT NULL,request_hash text NOT NULL,
 payload_ref uuid NOT NULL UNIQUE,payload_bytes integer NOT NULL CHECK(payload_bytes BETWEEN 1 AND 26214400),
 route jsonb NOT NULL, envelope jsonb NOT NULL DEFAULT '{}',
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('staging','queued','leased','preparation_review','handoff','accepted','rejected','cancelled','unknown')),
 not_before timestamptz NOT NULL DEFAULT now(),lease_token uuid,lease_until timestamptz,
 provider_id text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 UNIQUE(customer_id,source_id,idempotency_key)
);
ALTER TABLE webdock_mail.send_job ADD COLUMN IF NOT EXISTS envelope jsonb NOT NULL DEFAULT '{}';
ALTER TABLE webdock_mail.send_job DROP CONSTRAINT IF EXISTS send_job_state_check;
ALTER TABLE webdock_mail.send_job ADD CONSTRAINT send_job_state_check CHECK(state IN ('staging','queued','leased','preparation_review','handoff','accepted','rejected','cancelled','unknown'));
ALTER TABLE webdock_mail.send_job ADD COLUMN IF NOT EXISTS payload_format text NOT NULL DEFAULT 'request' CHECK(payload_format IN ('request','mime'));
ALTER TABLE webdock_mail.send_job ADD COLUMN IF NOT EXISTS source_context jsonb NOT NULL DEFAULT '{}';
ALTER TABLE webdock_mail.send_job ADD COLUMN IF NOT EXISTS filing_state text;
ALTER TABLE webdock_mail.send_job ADD COLUMN IF NOT EXISTS payload_deleted_at timestamptz;
ALTER TABLE webdock_mail.send_job ADD COLUMN IF NOT EXISTS message_digest text;
ALTER TABLE webdock_mail.send_job ADD COLUMN IF NOT EXISTS submission_gate_queue_id text;
CREATE INDEX IF NOT EXISTS send_job_due ON webdock_mail.send_job(not_before,id) WHERE state='queued';
DROP INDEX IF EXISTS webdock_mail.send_job_cleanup;
CREATE INDEX send_job_cleanup ON webdock_mail.send_job(finished_at) WHERE state IN ('accepted','rejected','cancelled') AND payload_deleted_at IS NULL AND (payload_format='request' OR state<>'accepted' OR filing_state='complete');
CREATE INDEX IF NOT EXISTS send_job_staging_expiry ON webdock_mail.send_job(lease_until) WHERE state='staging';
CREATE INDEX IF NOT EXISTS send_job_expiry ON webdock_mail.send_job(lease_until) WHERE state IN ('leased','handoff');
`;
export function outboxGrants(role:string){if(!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw Error('Invalid Mail role');return `GRANT SELECT,INSERT,UPDATE ON webdock_mail.send_job TO "${role}";`;}
export type SendLease={id:string;customerID:string;sourceID:string;payloadRef:string;payloadBytes:number;requestHash:string;payloadFormat:'request'|'mime';sourceContext:Record<string,unknown>;route:Record<string,unknown>;envelope:Record<string,unknown>;leaseToken:string};
function invalid():never{throw new MailServiceError('Mail submission is unavailable.');}
function id(value:string){if(!/^[1-9][0-9]{0,18}$/.test(value))invalid();}
function lease(value:SendLease){id(value.id);id(value.customerID);if(!/^[a-f0-9-]{36}$/.test(value.leaseToken))invalid();}

/** Internal only. Caller authorizes source, sender, route and budget in this same transaction. */
export async function enqueueMail(db:DB,input:{id?:string;customerID:string;sourceID:string;idempotencyKey:string;requestHash:string;payloadRef:string;payloadBytes:number;route:Record<string,unknown>;envelope?:Record<string,unknown>;payloadFormat?:'request'|'mime';sourceContext?:Record<string,unknown>;staging?:boolean;notBefore?:Date}){
 id(input.customerID);if(input.id)id(input.id);
 if(!/^[\x21-\x7e]{1,200}$/.test(input.sourceID) || !/^[\x21-\x7e]{1,200}$/.test(input.idempotencyKey) || !/^[a-f0-9]{64}$/.test(input.requestHash) || !/^[a-f0-9-]{36}$/.test(input.payloadRef) || !Number.isSafeInteger(input.payloadBytes) || input.payloadBytes<1 || input.payloadBytes>26214400)invalid();
 if(!input.route || !['direct','stalwart'].includes(String(input.route.kind)) || Buffer.byteLength(JSON.stringify(input.route))>4096)invalid();
 if(Buffer.byteLength(JSON.stringify(input.envelope??{}))>65536)invalid();
 if(Buffer.byteLength(JSON.stringify(input.sourceContext??{}))>4096 || !['request','mime'].includes(input.payloadFormat??'request'))invalid();
 if(input.notBefore && (!Number.isFinite(input.notBefore.getTime()) || input.notBefore.getTime()>Date.now()+30*86400000))invalid();
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['mail-outbox:'+input.customerID]);
 const previous=(await db.query('SELECT id,request_hash,state FROM webdock_mail.send_job WHERE customer_id=$1 AND source_id=$2 AND idempotency_key=$3',[input.customerID,input.sourceID,input.idempotencyKey])).rows[0];
 if(previous){if(previous.request_hash!==input.requestHash)invalid();return {id:previous.id as string,state:previous.state as string,created:false};}
 const usage=(await db.query("SELECT count(*)::int AS count,coalesce(sum(payload_bytes),0)::text AS bytes FROM webdock_mail.send_job WHERE customer_id=$1 AND (state IN ('staging','queued','leased','preparation_review','handoff','unknown') OR (state='accepted' AND payload_format='mime' AND filing_state IS DISTINCT FROM 'complete'))",[input.customerID])).rows[0];
 if(usage.count>=1000 || BigInt(usage.bytes)+BigInt(input.payloadBytes)>268435456n)invalid();
 const uploadToken=input.staging?randomUUID():null;
 const row=(await db.query(`INSERT INTO webdock_mail.send_job(id,customer_id,source_id,idempotency_key,request_hash,payload_ref,payload_bytes,route,not_before,envelope,state,lease_token,lease_until,payload_format,source_context,filing_state)
 VALUES(coalesce($1,webdock_auth.next_snowflake()),$2,$3,$4,$5,$6,$7,$8,coalesce($9,now()),$10,$11,$12,CASE WHEN $12::uuid IS NOT NULL THEN now()+interval '2 minutes' ELSE NULL END,$13,$14,CASE WHEN $13='mime' THEN 'pending' ELSE NULL END) RETURNING id,state`,[input.id??null,input.customerID,input.sourceID,input.idempotencyKey,input.requestHash,input.payloadRef,input.payloadBytes,JSON.stringify(input.route),input.notBefore??null,JSON.stringify(input.envelope??{}),input.staging?'staging':'queued',uploadToken,input.payloadFormat??'request',JSON.stringify(input.sourceContext??{})])).rows[0];
 return {id:row.id as string,state:row.state as string,created:true,...(uploadToken?{uploadToken}:{})};
}
/** Claim preparation can retry; handoff never can. Each function requires a transaction. */
export async function claimSend(db:DB):Promise<SendLease|null>{
 await db.query(`WITH expired AS (SELECT id FROM webdock_mail.send_job WHERE state IN ('leased','handoff') AND lease_until<now() FOR UPDATE SKIP LOCKED LIMIT 100)
 UPDATE webdock_mail.send_job SET state=CASE WHEN state='leased' THEN 'queued' ELSE 'unknown' END WHERE id IN (SELECT id FROM expired)`);
 const row=(await db.query("SELECT * FROM webdock_mail.send_job WHERE state='queued' AND not_before<=now() ORDER BY not_before,id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
 if(!row)return null;
 const token=randomUUID();
 await db.query("UPDATE webdock_mail.send_job SET state='leased',lease_token=$2,lease_until=now()+interval '2 minutes' WHERE id=$1",[row.id,token]);
 return {id:row.id,customerID:row.customer_id,sourceID:row.source_id,payloadRef:row.payload_ref,payloadBytes:row.payload_bytes,requestHash:row.request_hash,payloadFormat:row.payload_format,sourceContext:row.source_context,route:row.route,envelope:row.envelope,leaseToken:token};
}
/** Must commit before network I/O. Caller reauthorizes immediately before this transition. */
export async function beginHandoff(db:DB,job:SendLease){
 lease(job);
 return Boolean((await db.query("UPDATE webdock_mail.send_job SET state='handoff',lease_until=now()+interval '2 minutes' WHERE id=$1 AND customer_id=$2 AND lease_token=$3 AND state='leased' AND lease_until>now() RETURNING id",[job.id,job.customerID,job.leaseToken])).rowCount);
}
/** Late definitive receipts can resolve unknown, but may never authorize another attempt. */
export async function finishHandoff(db:DB,job:SendLease,result:{state:'accepted'|'rejected'|'unknown';providerID?:string}){
 lease(job);if(!['accepted','rejected','unknown'].includes(result.state) || (result.state==='accepted' ? typeof result.providerID!=='string' || !/^[A-Za-z0-9_-]{1,255}$/.test(result.providerID) : result.providerID!==undefined))invalid();
 const row=(await db.query('SELECT state,provider_id FROM webdock_mail.send_job WHERE id=$1 AND customer_id=$2 AND lease_token=$3 FOR UPDATE',[job.id,job.customerID,job.leaseToken])).rows[0];
 if(!row)return false;
 if(row.state===result.state && row.provider_id===(result.providerID??null))return true;
 if(!['handoff','unknown'].includes(row.state))return false;
 await db.query("UPDATE webdock_mail.send_job SET state=$2,provider_id=$3,finished_at=CASE WHEN $2='unknown' THEN NULL ELSE now() END WHERE id=$1",[job.id,result.state,result.providerID??null]);return true;
}
/** Caller authorizes the source and releases its budget in the same transaction. */
export async function cancelSend(db:DB,customerID:string,jobID:string){
 id(customerID);id(jobID);
 return Boolean((await db.query("UPDATE webdock_mail.send_job SET state='cancelled',finished_at=now() WHERE id=$1 AND customer_id=$2 AND state IN ('staging','queued','leased','preparation_review') RETURNING id",[jobID,customerID])).rowCount);
}

/** Preserve unreadable payloads and budget: a missing key/volume must never silently destroy queued mail. */
export async function reviewPreparation(db:DB,job:SendLease){
 lease(job);
 return Boolean((await db.query("UPDATE webdock_mail.send_job SET state='preparation_review',finished_at=NULL WHERE id=$1 AND customer_id=$2 AND lease_token=$3 AND state='leased' AND lease_until>now() RETURNING id",[job.id,job.customerID,job.leaseToken])).rowCount);
}

export type PayloadLease={id:string;customerID:string;payloadRef:string;uploadToken:string};
export async function commitPayload(db:DB,value:PayloadLease){
 id(value.id);id(value.customerID);
 if(!/^[a-f0-9-]{36}$/.test(value.uploadToken) || !/^[a-f0-9-]{36}$/.test(value.payloadRef))invalid();
 return Boolean((await db.query("UPDATE webdock_mail.send_job SET state='queued',lease_token=NULL,lease_until=NULL WHERE id=$1 AND customer_id=$2 AND payload_ref=$3 AND lease_token=$4 AND state='staging' AND lease_until>now() RETURNING id",[value.id,value.customerID,value.payloadRef,value.uploadToken])).rowCount);
}
