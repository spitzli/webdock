// Existing Better Auth 1.7.7 tables; generated from the isolated baseline and reviewed.
// This mapping does not own migrations or recreate production identity tables.
import {
  pgSchema,
  pgTable,
  varchar,
  text,
  boolean,
  serial,
  integer,
  date,
  bigint,
  timestamp,
  jsonb,
  uuid,
  pgEnum,
  numeric,
  index,
  uniqueIndex,
  foreignKey,
  type AnyPgColumn,
  primaryKey,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const webdockAuth = pgSchema("webdock_auth");
export const account = webdockAuth.table(
  "account",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    index("account_userId_idx").using("btree", table.userId.asc().nullsLast()),
  ],
);

export const invitation = webdockAuth.table(
  "invitation",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: text(),
    status: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    inviterId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_email_idx").using("btree", table.email.asc().nullsLast()),
    index("invitation_organizationId_idx").using(
      "btree",
      table.organizationId.asc().nullsLast(),
    ),
  ],
);

export const jwks = webdockAuth.table("jwks", {
  id: text()
    .default(sql`webdock_auth.next_snowflake()`)
    .primaryKey(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull(),
  expiresAt: timestamp({ withTimezone: true }),
  alg: text(),
  crv: text(),
});

export const member = webdockAuth.table(
  "member",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    index("member_organizationId_idx").using(
      "btree",
      table.organizationId.asc().nullsLast(),
    ),
    index("member_userId_idx").using("btree", table.userId.asc().nullsLast()),
  ],
);

export const oauthAccessToken = webdockAuth.table(
  "oauthAccessToken",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    token: text().notNull(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text().references(() => session.id, { onDelete: "set null" }),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: jsonb(),
    requestedUserInfoClaims: jsonb(),
    refreshId: text().references(() => oauthRefreshToken.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    revoked: timestamp({ withTimezone: true }),
    confirmation: jsonb(),
    scopes: jsonb().notNull(),
  },
  (table) => [
    index("oauthAccessToken_authorizationCodeId_idx").using(
      "btree",
      table.authorizationCodeId.asc().nullsLast(),
    ),
    index("oauthAccessToken_clientId_idx").using(
      "btree",
      table.clientId.asc().nullsLast(),
    ),
    index("oauthAccessToken_refreshId_idx").using(
      "btree",
      table.refreshId.asc().nullsLast(),
    ),
    index("oauthAccessToken_sessionId_idx").using(
      "btree",
      table.sessionId.asc().nullsLast(),
    ),
    index("oauthAccessToken_userId_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
    unique("oauthAccessToken_token_key").on(table.token),
  ],
);

export const oauthClient = webdockAuth.table(
  "oauthClient",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    clientId: text().notNull(),
    clientSecret: text(),
    clientDiscoveryId: text(),
    disabled: boolean(),
    skipConsent: boolean(),
    enableEndSession: boolean(),
    subjectType: text(),
    scopes: jsonb(),
    clientCredentialsScopes: jsonb(),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }),
    name: text(),
    uri: text(),
    icon: text(),
    contacts: jsonb(),
    tos: text(),
    policy: text(),
    softwareId: text(),
    softwareVersion: text(),
    softwareStatement: text(),
    redirectUris: jsonb().notNull(),
    postLogoutRedirectUris: jsonb(),
    backchannelLogoutUri: text(),
    backchannelLogoutSessionRequired: boolean(),
    tokenEndpointAuthMethod: text(),
    applicationType: text(),
    jwks: text(),
    jwksUri: text(),
    grantTypes: jsonb(),
    responseTypes: jsonb(),
    requirePKCE: boolean(),
    dpopBoundAccessTokens: boolean(),
    referenceId: text(),
    metadata: jsonb(),
  },
  (table) => [
    index("oauthClient_userId_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
    unique("oauthClient_clientId_key").on(table.clientId),
  ],
);

export const oauthClientAssertion = webdockAuth.table("oauthClientAssertion", {
  id: text()
    .default(sql`webdock_auth.next_snowflake()`)
    .primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

export const oauthClientResource = webdockAuth.table(
  "oauthClientResource",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text()
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: jsonb(),
    createdAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index("oauthClientResource_clientId_idx").using(
      "btree",
      table.clientId.asc().nullsLast(),
    ),
    uniqueIndex("oauthClientResource_clientId_resourceId_uidx").using(
      "btree",
      table.clientId.asc().nullsLast(),
      table.resourceId.asc().nullsLast(),
    ),
    index("oauthClientResource_resourceId_idx").using(
      "btree",
      table.resourceId.asc().nullsLast(),
    ),
  ],
);

export const oauthConsent = webdockAuth.table(
  "oauthConsent",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    resources: jsonb(),
    requestedUserInfoClaims: jsonb(),
    scopes: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [
    index("oauthConsent_clientId_idx").using(
      "btree",
      table.clientId.asc().nullsLast(),
    ),
    index("oauthConsent_userId_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
  ],
);

export const oauthRefreshToken = webdockAuth.table(
  "oauthRefreshToken",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    token: text().notNull(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text().references(() => session.id, { onDelete: "set null" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: jsonb(),
    requestedUserInfoClaims: jsonb(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    revoked: timestamp({ withTimezone: true }),
    rotatedAt: timestamp({ withTimezone: true }),
    rotationReplayResponse: text(),
    rotationReplayExpiresAt: timestamp({ withTimezone: true }),
    authTime: timestamp({ withTimezone: true }),
    confirmation: jsonb(),
    scopes: jsonb().notNull(),
  },
  (table) => [
    index("oauthRefreshToken_authorizationCodeId_idx").using(
      "btree",
      table.authorizationCodeId.asc().nullsLast(),
    ),
    index("oauthRefreshToken_clientId_idx").using(
      "btree",
      table.clientId.asc().nullsLast(),
    ),
    index("oauthRefreshToken_sessionId_idx").using(
      "btree",
      table.sessionId.asc().nullsLast(),
    ),
    index("oauthRefreshToken_userId_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
    unique("oauthRefreshToken_token_key").on(table.token),
  ],
);

export const oauthResource = webdockAuth.table(
  "oauthResource",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    identifier: text().notNull(),
    name: text().notNull(),
    accessTokenTtl: integer(),
    refreshTokenTtl: integer(),
    signingAlgorithm: text(),
    signingKeyId: text(),
    allowedScopes: jsonb(),
    customClaims: jsonb(),
    dpopBoundAccessTokensRequired: boolean(),
    disabled: boolean(),
    createdAt: timestamp({ withTimezone: true }),
    updatedAt: timestamp({ withTimezone: true }),
    policyVersion: integer(),
    metadata: jsonb(),
  },
  (table) => [unique("oauthResource_identifier_key").on(table.identifier)],
);

export const organization = webdockAuth.table(
  "organization",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    name: text().notNull(),
    slug: text().notNull(),
    logo: text(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    metadata: text(),
  },
  (table) => [unique("organization_slug_key").on(table.slug)],
);

export const passkey = webdockAuth.table(
  "passkey",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    name: text(),
    publicKey: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text().notNull(),
    counter: integer().notNull(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull(),
    transports: text(),
    createdAt: timestamp({ withTimezone: true }),
    aaguid: text(),
  },
  (table) => [
    index("passkey_credentialID_idx").using(
      "btree",
      table.credentialID.asc().nullsLast(),
    ),
    index("passkey_userId_idx").using("btree", table.userId.asc().nullsLast()),
  ],
);

export const rateLimit = webdockAuth.table(
  "rateLimit",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    key: text().notNull(),
    count: integer().notNull(),
    lastRequest: bigint({ mode: "number" }).notNull(),
  },
  (table) => [unique("rateLimit_key_key").on(table.key)],
);

export const session = webdockAuth.table(
  "session",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text(),
    activeOrganizationId: text(),
  },
  (table) => [
    index("session_userId_idx").using("btree", table.userId.asc().nullsLast()),
    unique("session_token_key").on(table.token),
  ],
);

export const twoFactor = webdockAuth.table(
  "twoFactor",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean(),
    failedVerificationCount: integer(),
    lockedUntil: timestamp({ withTimezone: true }),
  },
  (table) => [
    index("twoFactor_secret_idx").using(
      "btree",
      table.secret.asc().nullsLast(),
    ),
    index("twoFactor_userId_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
  ],
);

export const user = webdockAuth.table(
  "user",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull(),
    image: text(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    role: text(),
    banned: boolean(),
    banReason: text(),
    banExpires: timestamp({ withTimezone: true }),
    twoFactorEnabled: boolean(),
    mustChangePassword: boolean().notNull(),
  },
  (table) => [unique("user_email_key").on(table.email)],
);

export const verification = webdockAuth.table(
  "verification",
  {
    id: text()
      .default(sql`webdock_auth.next_snowflake()`)
      .primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("verification_identifier_idx").using(
      "btree",
      table.identifier.asc().nullsLast(),
    ),
  ],
);
