import { withMailTransaction } from "./store";
export async function pruneMailData(
  now: Date,
): Promise<Record<string, number>> {
  if (!Number.isFinite(now.getTime())) throw Error("Invalid retention time");
  return withMailTransaction(async (db) => {
    const report: Record<string, number> = {};
    const run = async (name: string, sql: string) => {
      report[name] = (await db.query(sql, [now])).rowCount ?? 0;
    };
    await run(
      "content",
      `DELETE FROM webdock_auth.mail_message_content WHERE message_id IN (SELECT c.message_id FROM webdock_auth.mail_message_content c JOIN webdock_auth.mail_message m ON m.id=c.message_id
   WHERE (m.dispatch_status='outcome_unknown' AND coalesce(m.handoff_started_at,m.created_at)<$1::timestamptz-interval '7 days')
   OR (m.terminal_at IS NOT NULL AND coalesce(c.expires_at,m.terminal_at+interval '30 days')<$1) LIMIT 500)`,
    );
    await run(
      "logs",
      `DELETE FROM webdock_auth.mail_request_log WHERE id IN (SELECT id FROM webdock_auth.mail_request_log WHERE created_at<$1::timestamptz-interval '30 days' LIMIT 500)`,
    );
    await run(
      "webhookAttempts",
      `DELETE FROM webdock_auth.mail_webhook_attempt WHERE id IN (SELECT a.id FROM webdock_auth.mail_webhook_attempt a JOIN webdock_auth.mail_webhook_delivery d ON d.id=a.delivery_id WHERE d.status IN ('succeeded','failed','canceled') AND d.finished_at<$1::timestamptz-interval '30 days' LIMIT 500)`,
    );
    await run(
      "webhookDeliveries",
      `DELETE FROM webdock_auth.mail_webhook_delivery WHERE id IN (SELECT d.id FROM webdock_auth.mail_webhook_delivery d WHERE d.status IN ('succeeded','failed','canceled') AND d.finished_at<$1::timestamptz-interval '30 days' AND (d.lease_until IS NULL OR d.lease_until<$1) AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_webhook_attempt a WHERE a.delivery_id=d.id) LIMIT 500)`,
    );
    await run(
      "callbackInbox",
      `DELETE FROM webdock_auth.mail_callback_inbox WHERE id IN (SELECT id FROM webdock_auth.mail_callback_inbox WHERE (status='processed' AND processed_at<$1::timestamptz-interval '7 days') OR (status='quarantined' AND created_at<$1::timestamptz-interval '7 days') LIMIT 500)`,
    );
    await run(
      "idempotency",
      `DELETE FROM webdock_auth.mail_idempotency WHERE (customer_id,connection_id,key) IN (SELECT i.customer_id,i.connection_id,i.key FROM webdock_auth.mail_idempotency i WHERE i.status='completed' AND i.expires_at<$1
   AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_message m WHERE (m.id=i.message_id OR m.id IN (SELECT message_id FROM webdock_auth.mail_batch_item WHERE batch_id=i.batch_id)) AND m.dispatch_status IN ('dispatching','outcome_unknown'))
   AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_batch b WHERE b.id=i.batch_id AND b.status='processing') LIMIT 500)`,
    );
    await run(
      "batchItems",
      `DELETE FROM webdock_auth.mail_batch_item WHERE (batch_id,item_index) IN (SELECT i.batch_id,i.item_index FROM webdock_auth.mail_batch_item i JOIN webdock_auth.mail_batch b ON b.id=i.batch_id WHERE b.status<>'processing' AND b.finished_at<$1::timestamptz-interval '90 days'
   AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_idempotency k WHERE k.batch_id=b.id) AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_batch_item x JOIN webdock_auth.mail_message m ON m.id=x.message_id WHERE x.batch_id=b.id AND m.dispatch_status IN ('dispatching','outcome_unknown')) LIMIT 500)`,
    );
    await run(
      "batches",
      `DELETE FROM webdock_auth.mail_batch WHERE id IN (SELECT b.id FROM webdock_auth.mail_batch b WHERE b.status<>'processing' AND b.finished_at<$1::timestamptz-interval '90 days' AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_batch_item i WHERE i.batch_id=b.id) AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_idempotency i WHERE i.batch_id=b.id) LIMIT 500)`,
    );
    await run(
      "usageReservations",
      `DELETE FROM webdock_auth.mail_usage_reservation WHERE message_id IN (SELECT r.message_id FROM webdock_auth.mail_usage_reservation r JOIN webdock_auth.mail_message m ON m.id=r.message_id WHERE r.status<>'reserved' AND m.terminal_at<$1::timestamptz-interval '90 days' LIMIT 500)`,
    );
    await run(
      "events",
      `DELETE FROM webdock_auth.mail_event WHERE id IN (SELECT e.id FROM webdock_auth.mail_event e LEFT JOIN webdock_auth.mail_message m ON m.id=e.message_id WHERE e.created_at<$1::timestamptz-interval '90 days' AND (e.message_id IS NULL OR m.terminal_at<$1::timestamptz-interval '90 days') AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_webhook_delivery d WHERE d.event_id=e.id) LIMIT 500)`,
    );
    await run(
      "messages",
      `DELETE FROM webdock_auth.mail_message WHERE id IN (SELECT m.id FROM webdock_auth.mail_message m WHERE m.terminal_at<$1::timestamptz-interval '90 days' AND m.dispatch_status IN ('accepted','failed','canceled','suppressed')
   AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_event e WHERE e.message_id=m.id) AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_idempotency i WHERE i.message_id=m.id)
   AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_batch_item b WHERE b.message_id=m.id) AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_usage_reservation r WHERE r.message_id=m.id) LIMIT 500)`,
    );
    await run(
      "rateWindows",
      `DELETE FROM webdock_auth.mail_rate_window WHERE (customer_id,kind,window_start) IN (SELECT customer_id,kind,window_start FROM webdock_auth.mail_rate_window WHERE window_start<$1::timestamptz-interval '2 hours' LIMIT 500)`,
    );
    await run(
      "jobRuns",
      `DELETE FROM webdock_auth.mail_job_run WHERE id IN (SELECT id FROM webdock_auth.mail_job_run WHERE finished_at<$1::timestamptz-interval '30 days' LIMIT 500)`,
    );
    return report;
  });
}
