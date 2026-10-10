import { createHash, randomBytes } from "node:crypto";
import { HostingError, type HostingActor } from "@webdock/hosting-contracts";
import {
  gitOAuthCommandSchema,
  type GitOAuthCommand,
} from "@webdock/hosting-contracts/git-oauth";
import { encryptMailSecret, decryptMailSecret } from "../platform";
import { authorizeHosting } from "./authorization";
import { transaction } from "./db";
import { createGitHubProvider } from "./git-github";
import { registerGitConnection } from "./git-deployments";

export function gitOAuthSettings(
  env: Record<string, string | undefined> = process.env,
) {
  try {
    const origin = new URL(env.WEBDOCK_GIT_STUDIO_ORIGIN!);
    const local =
      env.NODE_ENV !== "production" &&
      origin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(origin.hostname);
    if (
      (!local && origin.protocol !== "https:") ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      !env.WEBDOCK_GITHUB_CLIENT_ID ||
      !/^[a-z0-9-]{1,100}$/.test(env.WEBDOCK_GITHUB_APP_SLUG ?? "")
    )
      throw Error();
    return {
      clientID: env.WEBDOCK_GITHUB_CLIENT_ID,
      appSlug: env.WEBDOCK_GITHUB_APP_SLUG!,
      redirectURI: `${origin.origin}/api/hosting/git/callback`,
    };
  } catch {
    throw new HostingError(503, "GitHub connection setup is incomplete.");
  }
}

const digest = (state: string) =>
  createHash("sha256").update(state).digest("hex");
export async function executeGitOAuth(
  actor: HostingActor,
  raw: GitOAuthCommand,
  runtime?: ReturnType<typeof createGitHubProvider>,
) {
  if (actor.source !== "studio")
    throw new HostingError(403, "Connect GitHub interactively in Studio.");
  const command = gitOAuthCommandSchema.parse(raw);
  const config = gitOAuthSettings();
  return transaction(async (db) => {
    if (command.action === "git.oauth.begin") {
      await authorizeHosting(
        actor,
        { customerID: command.customerID, write: true, tenantAdmin: true },
        db,
      );
      const recent = (
        await db.query(
          "SELECT count(*)::int AS count FROM webdock_auth.git_flow WHERE subject=$1 AND expires_at>now()",
          [actor.subject],
        )
      ).rows[0].count;
      if (recent >= 5)
        throw new HostingError(429, "Wait before connecting GitHub again.");
      const state = randomBytes(32).toString("base64url");
      await db.query(
        "INSERT INTO webdock_auth.git_flow(state_hash,subject,session_id,customer_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
        [digest(state), actor.subject, actor.sessionID, command.customerID],
      );
      const url = new URL("https://github.com/login/oauth/authorize");
      url.search = new URLSearchParams({
        client_id: config.clientID,
        redirect_uri: config.redirectURI,
        state,
      }).toString();
      return { url: url.href, state };
    }
    const hash = digest(command.state);
    const flow = (
      await db.query(
        "SELECT * FROM webdock_auth.git_flow WHERE state_hash=$1 AND subject=$2 AND session_id=$3 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
        [hash, actor.subject, actor.sessionID],
      )
    ).rows[0];
    if (!flow)
      throw new HostingError(403, "GitHub connection expired. Start again.");
    await authorizeHosting(
      actor,
      { customerID: flow.customer_id, write: true, tenantAdmin: true },
      db,
    );
    const provider = runtime ?? createGitHubProvider();
    if (command.action === "git.oauth.exchange") {
      if (flow.user_token_encrypted)
        throw new HostingError(409, "GitHub authorization was already used.");
      const token = await provider.exchangeOAuthCode(
        command.code,
        config.redirectURI,
      );
      await db.query(
        "UPDATE webdock_auth.git_flow SET user_token_encrypted=$2 WHERE state_hash=$1",
        [hash, encryptMailSecret(token, `git-oauth:${hash}`)],
      );
      return { customerID: flow.customer_id };
    }
    if (!flow.user_token_encrypted)
      throw new HostingError(403, "Complete GitHub authorization first.");
    const token = decryptMailSecret<string>(
      flow.user_token_encrypted,
      `git-oauth:${hash}`,
    );
    if (command.action === "git.oauth.options") {
      const installations = await provider.listUserInstallations(token);
      if (
        command.installationID &&
        !installations.some((i) => i.installationID === command.installationID)
      )
        throw new HostingError(403, "GitHub installation is unavailable.");
      return {
        customerID: flow.customer_id,
        installations,
        repositories: command.installationID
          ? await provider.listUserRepositories(token, command.installationID)
          : [],
        installURL: `https://github.com/apps/${config.appSlug}/installations/new`,
      };
    }
    const binding = await provider.verifyRepository(
      token,
      command.installationID,
      command.repositoryID,
    );
    const connection = await registerGitConnection(
      actor,
      binding,
      flow.customer_id,
      db,
    );
    await db.query(
      "UPDATE webdock_auth.git_flow SET consumed_at=now(),user_token_encrypted=NULL WHERE state_hash=$1",
      [hash],
    );
    return { customerID: flow.customer_id, connection };
  });
}
