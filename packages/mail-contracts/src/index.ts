export type ID = string; // Snowflake; Provider-/Legacy-IDs separat als String
export type Permission = "sending_access" | "full_access";
export type MailCapability = "read" | "send" | "manage" | "operate";
export type MailActor = {
  customerID: ID;
  connectionID: ID;
  principal:
    | { kind: "session"; userID: ID; sessionID: ID }
    | { kind: "api_key"; keyID: ID }
    | { kind: "job"; jobID: ID };
};
export type EmailRequest = {
  from: string; to: string | string[]; subject: string;
  cc?: string | string[]; bcc?: string | string[];
  reply_to?: string | string[]; html?: string; text?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
  attachments?: {
    content: string; filename?: string;
    content_type?: string; content_id?: string;
  }[];
  scheduled_at?: string;
};
export type ApiResult<T = unknown> = { status: number; body: T };
export type PageQuery = { limit?: number; after?: string };
export type SendResult = { id: ID };
export type MailErrorBody = {
  statusCode: number; name: string; message: string; request_id: string;
  email_id?: ID; failed_index?: number; failed_email_id?: ID | null;
};
export type BatchResult = {
  id: ID; status: "processing" | "succeeded" | "failed";
  data: SendResult[]; failed_index?: number; failed_email_id?: ID | null;
};
export type DispatchOutcome =
  | { kind: "accepted"; mid: string }
  | { kind: "rejected"; code: string }
  | { kind: "unknown"; code: string };
export type EventType =
  | "email.scheduled" | "email.canceled" | "email.sent"
  | "email.delivery_delayed" | "email.delivered" | "email.opened"
  | "email.clicked" | "email.bounced" | "email.complained"
  | "email.unsubscribed" | "email.failed" | "email.suppressed"
  | "domain.created" | "domain.updated" | "domain.deleted";
export type MailEventInput = {
  customerID: ID; connectionID: ID; resourceID: ID;
  type: EventType; recipient?: string; occurredAt: string;
  source: "application" | "provider" | "simulator" | "reconciliation";
  dedupeKey: string; details?: Record<string, unknown>;
};

export * from "./limits";
export * from "./events";
