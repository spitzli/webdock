// Typed mapping of the additive billing tables. SQL migrations own constraints, RLS and immutable-history triggers.
import {
  pgSchema,
  text,
  varchar,
  boolean,
  integer,
  uuid,
  timestamp,
  jsonb,
  bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
const webdockAuth = pgSchema("webdock_auth");

export const billingCheckout = webdockAuth.table("billing_checkout", {
  id: text()
    .default(sql`webdock_auth.next_snowflake()`)
    .primaryKey(),
  environment: text().notNull(),
  customerId: varchar("customer_id").notNull(),
  contractId: text("contract_id").notNull(),
  operationId: uuid("operation_id").notNull(),
  polarCheckoutId: uuid("polar_checkout_id"),
  expectedProductId: uuid("expected_product_id").notNull(),
  expectedCustomerId: uuid("expected_customer_id"),
  amount: bigint({ mode: "bigint" }).notNull(),
  currency: text().notNull(),
  encryptedUrl: text("encrypted_url"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  state: text().default("reserved").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const billingConnection = webdockAuth.table("billing_connection", {
  environment: text().primaryKey(),
  organizationId: uuid("organization_id"),
  organizationName: text("organization_name"),
  locked: boolean().default(false).notNull(),
  encryptedToken: text("encrypted_token"),
  tokenSuffix: text("token_suffix"),
  tokenVersion: integer("token_version").default(0).notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  encryptedWebhookSecret: text("encrypted_webhook_secret"),
  webhookVersion: integer("webhook_version").default(0).notNull(),
  previousWebhookSecret: text("previous_webhook_secret"),
  previousWebhookVersion: integer("previous_webhook_version"),
  previousWebhookUntil: timestamp("previous_webhook_until", {
    withTimezone: true,
  }),
  endpointId: uuid("endpoint_id"),
  apiVersion: text("api_version").default("2026-10").notNull(),
  salesEnabled: boolean("sales_enabled").default(false).notNull(),
  catalogPublishEnabled: boolean("catalog_publish_enabled")
    .default(false)
    .notNull(),
  enforcementEnabled: boolean("enforcement_enabled").default(false).notNull(),
  revision: bigint({ mode: "bigint" }).default(0n).notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const billingContract = webdockAuth.table("billing_contract", {
  id: text()
    .default(sql`webdock_auth.next_snowflake()`)
    .primaryKey(),
  environment: text().notNull(),
  customerId: varchar("customer_id").notNull(),
  versionId: text("version_id").notNull(),
  organizationId: text("organization_id").notNull(),
  bindingId: text("binding_id").notNull(),
  projectId: varchar("project_id").notNull(),
  serviceKey: text("service_key").default("website-base").notNull(),
  mode: text().default("polar").notNull(),
  snapshot: jsonb().notNull(),
  previousBase: jsonb("previous_base"),
  termsHash: text("terms_hash").notNull(),
  offerId: text("offer_id"),
  acceptedBy: text("accepted_by").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  state: text().default("pending").notNull(),
  serviceStatus: text("service_status").default("pending").notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  projectedHash: text("projected_hash"),
  projectedAt: timestamp("projected_at", { withTimezone: true }),
});

export const billingCustomer = webdockAuth.table("billing_customer", {
  environment: text().notNull(),
  customerId: varchar("customer_id").notNull(),
  polarCustomerId: uuid("polar_customer_id"),
  externalId: text("external_id").generatedAlwaysAs(
    sql`('webdock:'::text || (customer_id)::text)`,
  ),
  billingEmail: text("billing_email"),
  isTest: boolean("is_test").default(false).notNull(),
  generation: bigint({ mode: "bigint" }).default(0n).notNull(),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
});

export const billingJob = webdockAuth.table("billing_job", {
  id: text()
    .default(sql`webdock_auth.next_snowflake()`)
    .primaryKey(),
  environment: text().notNull(),
  customerId: varchar("customer_id"),
  kind: text().notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  eventId: text("event_id"),
  generation: bigint({ mode: "bigint" }).default(0n).notNull(),
  status: text().default("pending").notNull(),
  attempts: integer().default(0).notNull(),
  availableAt: timestamp("available_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  claimToken: uuid("claim_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const billingOrder = webdockAuth.table("billing_order", {
  id: text()
    .default(sql`webdock_auth.next_snowflake()`)
    .primaryKey(),
  environment: text().notNull(),
  customerId: varchar("customer_id").notNull(),
  contractId: text("contract_id").notNull(),
  polarOrderId: uuid("polar_order_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  status: text().notNull(),
  netAmount: bigint("net_amount", { mode: "bigint" }).notNull(),
  taxAmount: bigint("tax_amount", { mode: "bigint" }).notNull(),
  totalAmount: bigint("total_amount", { mode: "bigint" }).notNull(),
  currency: text().notNull(),
  refundedAmount: bigint("refunded_amount", { mode: "bigint" })
    .default(0n)
    .notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
});

export const billingProduct = webdockAuth.table("billing_product", {
  id: text()
    .default(sql`webdock_auth.next_snowflake()`)
    .primaryKey(),
  sku: text().notNull(),
  name: text().notNull(),
  family: text().notNull(),
  visibility: text().default("internal").notNull(),
  operationallyReady: boolean("operationally_ready").default(false).notNull(),
  archived: boolean().default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const billingProductMapping = webdockAuth.table(
  "billing_product_mapping",
  {
    environment: text().notNull(),
    versionId: text("version_id").notNull(),
    polarProductId: uuid("polar_product_id"),
    priceIds: jsonb("price_ids").default([]).notNull(),
    status: text().default("draft").notNull(),
    operationId: uuid("operation_id"),
    desiredHash: text("desired_hash"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    errorCode: text("error_code"),
  },
);

export const billingProductVersion = webdockAuth.table(
  "billing_product_version",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    productId: text("product_id").notNull(),
    version: integer().notNull(),
    amount: bigint({ mode: "bigint" }),
    currency: text().notNull(),
    taxBehavior: text("tax_behavior").notNull(),
    interval: text().notNull(),
    description: text().notNull(),
    termsText: text("terms_text").notNull().default(""),
    entitlements: jsonb().notNull(),
    termsHash: text("terms_hash").notNull(),
    frozen: boolean().default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
);

export const billingSubscription = webdockAuth.table("billing_subscription", {
  id: text()
    .default(sql`webdock_auth.next_snowflake()`)
    .primaryKey(),
  environment: text().notNull(),
  customerId: varchar("customer_id").notNull(),
  contractId: text("contract_id").notNull(),
  polarSubscriptionId: uuid("polar_subscription_id").notNull(),
  polarProductId: uuid("polar_product_id").notNull(),
  checkoutId: text("checkout_id").notNull(),
  status: text().notNull(),
  amount: bigint({ mode: "bigint" }),
  currency: text(),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  pendingUpdate: jsonb("pending_update"),
  pastDueAt: timestamp("past_due_at", { withTimezone: true }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  generation: bigint({ mode: "bigint" }).default(0n).notNull(),
  initialOrderPaid: boolean("initial_order_paid").default(false).notNull(),
});

export const billingWebhookEvent = webdockAuth.table("billing_webhook_event", {
  id: text()
    .default(sql`webdock_auth.next_snowflake()`)
    .primaryKey(),
  environment: text().notNull(),
  eventId: text("event_id").notNull(),
  bodyHash: text("body_hash").notNull(),
  encryptedBody: text("encrypted_body"),
  apiVersion: text("api_version").notNull(),
  eventType: text("event_type").notNull(),
  status: text().default("received").notNull(),
  conflictHash: text("conflict_hash"),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorCode: text("error_code"),
});

export const billingOffer = webdockAuth.table("billing_offer", {
  id: text()
    .primaryKey()
    .default(sql`webdock_auth.next_snowflake()`),
  environment: text().notNull(),
  customerId: varchar("customer_id").notNull(),
  versionId: text("version_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expectedRevision: integer("expected_revision").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text().notNull().default("pending"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  acceptedBy: text("accepted_by"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  contractId: text("contract_id"),
});
export const billingChange = webdockAuth.table("billing_change", {
  id: text()
    .primaryKey()
    .default(sql`webdock_auth.next_snowflake()`),
  environment: text().notNull(),
  customerId: varchar("customer_id").notNull(),
  contractId: text("contract_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  versionId: text("version_id").notNull(),
  operationId: uuid("operation_id").notNull(),
  fromProductId: uuid("from_product_id").notNull(),
  direction: text().notNull(),
  snapshot: jsonb().notNull(),
  termsHash: text("terms_hash").notNull(),
  offerId: text("offer_id"),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  status: text().notNull().default("reserved"),
  baselineOrderIds: jsonb("baseline_order_ids")
    .notNull()
    .default(sql`'[]'::jsonb`),
  claimToken: uuid("claim_token"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  errorCode: text("error_code"),
  acceptedBy: text("accepted_by").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});
export const billingManualRelease = webdockAuth.table(
  "billing_manual_release",
  {
    id: text()
      .primaryKey()
      .default(sql`webdock_auth.next_snowflake()`),
    environment: text().notNull().default("live"),
    customerId: varchar("customer_id").notNull(),
    contractId: text("contract_id").notNull(),
    actorId: text("actor_id").notNull(),
    reason: text().notNull(),
    expectedRevision: integer("expected_revision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
