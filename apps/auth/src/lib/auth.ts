import { betterAuth } from "better-auth";
import { lazyAuth } from "./lazy-auth";
import { admin, organization, jwt } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { oauthProvider } from "@better-auth/oauth-provider";
import {
  createAuthMiddleware,
  APIError,
  getSessionFromCtx,
} from "better-auth/api";
import { database } from "./db";
import { guardOrganizationRequest } from "./tenant-policy";
import { cookiePolicy } from "./cookie-policy";
import { offlineProvisioning } from "./offline";
import { currentClaims } from "./authorization";
import { sendAuthMail } from "./mail";
import { passkeySecurity, passwordTwoFactor } from "./passkeys";
import { mcpResource, mcpScopes, currentMCPClaims, hostingScopes, currentHostingMCPClaims } from "./mcp";
const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3125";
export const auth = lazyAuth(() => betterAuth({
  appName: "Webdock",
  baseURL,
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  database,
  trustedOrigins: [baseURL],
  disabledPaths: ["/token", "/admin/impersonate-user"],
  advanced: {
    database: { generateId: false },
    ...cookiePolicy(baseURL),
    ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] },
  },
  session: {
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 15,
    cookieCache: { enabled: false },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 200,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/two-factor/verify-totp": { window: 60, max: 8 },
      "/two-factor/verify-backup-code": { window: 60, max: 5 },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: async ({ user }) => {
      // The one-time reset link proves mailbox access for a provisioned invitee.
      await database.query('UPDATE webdock_auth."user" SET "emailVerified"=true,"mustChangePassword"=false WHERE id=$1 AND "mustChangePassword"=true', [user.id]);
    },
    sendResetPassword: async ({ user, url }) =>
      sendAuthMail({
        to: user.email,
        subject: "mustChangePassword" in user && user.mustChangePassword === true ? "Set up your Webdock account" : "Reset your Webdock password",
        text: "mustChangePassword" in user && user.mustChangePassword === true ? `Your Webdock administrator has invited you. Choose your password to set up your account:\n${url}\nIf you were not expecting an invitation, you can ignore this message.` : `Reset your Webdock password using this link:\n${url}\nIf you did not request this, you can ignore this message.`,
      }),
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) =>
      sendAuthMail({
        to: user.email,
        subject: "Verify your Webdock email",
        text: `Confirm your email using this link:\n${url}`,
      }),
  },
  user: {
    additionalFields: {
      mustChangePassword: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
    deleteUser: { enabled: false },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (
        (ctx.path.startsWith("/admin/") ||
          ctx.path.startsWith("/organization/")) &&
        !offlineProvisioning.getStore()
      ) {
        const session = await getSessionFromCtx(ctx);
        await guardOrganizationRequest(ctx.path, ctx.body, ctx.query, session?.user.id);
        if (
          (ctx.path.startsWith("/admin/") &&
            (!session || session.user.role !== "operator")) ||
          (session?.user.role === "operator" &&
            (session.user.mustChangePassword || !session.user.twoFactorEnabled))
        )
          throw new APIError("FORBIDDEN", {
            message: "Complete operator security setup first.",
          });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (
        ctx.path === "/two-factor/verify-totp" &&
        ctx.context.session?.user.twoFactorEnabled === false &&
        ctx.context.newSession?.user.twoFactorEnabled === true
      )
        await database.query(
          'DELETE FROM webdock_auth.session WHERE "userId"=$1 AND id<>$2',
          [ctx.context.newSession.user.id, ctx.context.newSession.session.id],
        );
      if (
        ctx.path === "/change-password" &&
        ctx.context.session?.user.id &&
        !(ctx.context.returned instanceof APIError)
      )
        await database.query(
          'UPDATE webdock_auth."user" SET "mustChangePassword"=false WHERE id=$1',
          [ctx.context.session.user.id],
        );
    }),
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["operator"],
      roles: { operator: adminAc, user: userAc },
    }),
    organization({
      allowUserToCreateOrganization: async (user) => {
        const row = (
          await database.query(
            'SELECT role FROM webdock_auth."user" WHERE id=$1',
            [user.id],
          )
        ).rows[0];
        return row?.role === "operator";
      },
      disableOrganizationDeletion: true,
      requireEmailVerificationOnInvitation: true,
      sendInvitationEmail: async (data) => {
        const user = (await database.query('SELECT "mustChangePassword","emailVerified" FROM webdock_auth."user" WHERE lower(email)=lower($1)', [data.email])).rows[0];
        if (user?.mustChangePassword && !user.emailVerified) {
          await auth.api.requestPasswordReset({ body: { email: data.email, redirectTo: `${baseURL}/reset-password?invitation=${encodeURIComponent(data.id)}` } });
        } else await sendAuthMail({
          to: data.email,
          subject: `Invitation to ${data.organization.name} on Webdock`,
          text: `You have been invited to ${data.organization.name}.\n${baseURL}/invitation?id=${encodeURIComponent(data.id)}`,
        });
      },
    }),
    passwordTwoFactor(),
    passkeySecurity(baseURL),
    jwt({ jwks: { keyPairConfig: { alg: "RS256" } } }),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      scopes: ["openid", "profile", "email", "offline_access", ...mcpScopes, ...hostingScopes],
      resources: [{ identifier: mcpResource, name: "Webdock Studio", allowedScopes: [...mcpScopes, ...hostingScopes, "offline_access"], accessTokenTtl: 300 }],
      enforcePerClientResources: true,
      grantTypes: ["authorization_code", "refresh_token"],
      refreshTokenExpiresIn: 60 * 60 * 8,
      // 1.7.7 discovers public PKCE support from this flag, even for manually
      // provisioned clients. Keep this false/true pair: DCR remains disabled
      // (checked first by /register), while discovery correctly advertises none.
      allowDynamicClientRegistration: false,
      allowUnauthenticatedClientRegistration: true,
      accessTokenExpiresIn: 28800,
      idTokenExpiresIn: 300,
      rateLimit: { introspect: { window: 60, max: 600 } },
      clientPrivileges: ({ user, action }) =>
        action === "create"
          ? Boolean(offlineProvisioning.getStore())
          : user?.role === "operator" &&
            user.twoFactorEnabled === true &&
            user.mustChangePassword !== true,
      postLogin: {
        page: "/account",
        consentReferenceId: () => undefined,
        shouldRedirect: ({ user }) =>
          user.mustChangePassword === true ||
          (user.role === "operator" && user.twoFactorEnabled !== true),
      },
      generateClientId: () => {
        const id = offlineProvisioning.getStore()?.clientID;
        if (!id)
          throw new APIError("FORBIDDEN", {
            message:
              "Clients are registered through the operator provisioning tool.",
          });
        return id;
      },
      extensions: [{ claims: { accessToken: async ({ ctx, metadata, grantType, sessionId, user }) => {
        if ((metadata?.webdock_mcp === true || metadata?.webdock_hosting === true) && grantType) {
          // Offline refresh tokens survive session deletion with a NULL FK.
          // Never let renewal turn session-bound access into sessionless access.
          const session = sessionId ? await ctx.context.adapter.findOne<{ userId: string; expiresAt: Date }>({
            model: "session", where: [{ field: "id", value: sessionId }],
          }) : null;
          if (!session || session.userId !== user?.id || new Date(session.expiresAt).getTime() <= Date.now())
            throw new APIError("FORBIDDEN", { message: "Sign in again to reconnect this client." });
        }
        return {};
      } } }],
      customTokenResponseFields: async ({ metadata, user }) => {
        if (metadata?.webdock_hosting === true && (await currentHostingMCPClaims(user?.id)).disabled)
          throw new APIError("FORBIDDEN", { message: "Current hosting authorization is required." });
        if (metadata?.webdock_mcp === true && (await currentMCPClaims(user?.id)).disabled)
          throw new APIError("FORBIDDEN", { message: "Current operator authorization is required." });
        return {};
      },
      customAccessTokenClaims: ({ user, metadata }) =>
        metadata?.webdock_hosting === true
          ? currentHostingMCPClaims(user?.id)
          : metadata?.webdock_mcp === true
          ? currentMCPClaims(user?.id)
          : currentClaims(user?.id, metadata?.webdock_binding),
    }),
  ],
}));
