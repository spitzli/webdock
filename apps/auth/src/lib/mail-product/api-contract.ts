export const mailOperations = [
  {
    "id": "emails.list",
    "method": "GET",
    "path": "/emails",
    "permission": "full_access"
  },
  {
    "id": "emails.send",
    "method": "POST",
    "path": "/emails",
    "permission": "sending_access"
  },
  {
    "id": "emails.batch",
    "method": "POST",
    "path": "/emails/batch",
    "permission": "sending_access"
  },
  {
    "id": "emails.get",
    "method": "GET",
    "path": "/emails/{id}",
    "permission": "full_access"
  },
  {
    "id": "emails.reschedule",
    "method": "PATCH",
    "path": "/emails/{id}",
    "permission": "full_access"
  },
  {
    "id": "emails.cancel",
    "method": "POST",
    "path": "/emails/{id}/cancel",
    "permission": "full_access"
  },
  {
    "id": "batches.get",
    "method": "GET",
    "path": "/batches/{id}",
    "permission": "full_access"
  },
  {
    "id": "domains.list",
    "method": "GET",
    "path": "/domains",
    "permission": "full_access"
  },
  {
    "id": "domains.create",
    "method": "POST",
    "path": "/domains",
    "permission": "full_access"
  },
  {
    "id": "domains.get",
    "method": "GET",
    "path": "/domains/{id}",
    "permission": "full_access"
  },
  {
    "id": "domains.delete",
    "method": "DELETE",
    "path": "/domains/{id}",
    "permission": "full_access"
  },
  {
    "id": "domains.verify",
    "method": "POST",
    "path": "/domains/{id}/verify",
    "permission": "full_access"
  },
  {
    "id": "keys.list",
    "method": "GET",
    "path": "/api-keys",
    "permission": "full_access"
  },
  {
    "id": "keys.create",
    "method": "POST",
    "path": "/api-keys",
    "permission": "full_access"
  },
  {
    "id": "keys.delete",
    "method": "DELETE",
    "path": "/api-keys/{id}",
    "permission": "full_access"
  },
  {
    "id": "webhooks.list",
    "method": "GET",
    "path": "/webhooks",
    "permission": "full_access"
  },
  {
    "id": "webhooks.create",
    "method": "POST",
    "path": "/webhooks",
    "permission": "full_access"
  },
  {
    "id": "webhooks.get",
    "method": "GET",
    "path": "/webhooks/{id}",
    "permission": "full_access"
  },
  {
    "id": "webhooks.update",
    "method": "PATCH",
    "path": "/webhooks/{id}",
    "permission": "full_access"
  },
  {
    "id": "webhooks.delete",
    "method": "DELETE",
    "path": "/webhooks/{id}",
    "permission": "full_access"
  },
  {
    "id": "webhooks.deliveries",
    "method": "GET",
    "path": "/webhooks/{id}/deliveries",
    "permission": "full_access"
  },
  {
    "id": "webhooks.rotate",
    "method": "POST",
    "path": "/webhooks/{id}/rotate",
    "permission": "full_access"
  },
  {
    "id": "webhooks.replay",
    "method": "POST",
    "path": "/webhooks/{id}/deliveries/{deliveryID}/replay",
    "permission": "full_access"
  },
  {
    "id": "suppressions.list",
    "method": "GET",
    "path": "/suppressions",
    "permission": "full_access"
  },
  {
    "id": "suppressions.create",
    "method": "POST",
    "path": "/suppressions",
    "permission": "full_access"
  },
  {
    "id": "suppressions.delete",
    "method": "DELETE",
    "path": "/suppressions/{email}",
    "permission": "full_access"
  },
  {
    "id": "logs.list",
    "method": "GET",
    "path": "/logs",
    "permission": "full_access"
  },
  {
    "id": "logs.get",
    "method": "GET",
    "path": "/logs/{id}",
    "permission": "full_access"
  },
  {
    "id": "analytics.get",
    "method": "GET",
    "path": "/analytics",
    "permission": "full_access"
  }
] as const;
export type MailOperation = typeof mailOperations[number]["id"];
