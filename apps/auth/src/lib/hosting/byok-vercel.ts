import { createHash, randomBytes } from "node:crypto";
import {
  HostingError,
  type HostingActor,
  type HostingCommand,
} from "@webdock/hosting-contracts";
import {
  fetchVercelProject,
  listVercelProjects,
} from "@webdock/hosting-contracts/vercel";
import { encryptMailSecret, decryptMailSecret } from "../platform";
import { transaction, audit, planLock } from "./db";
import { byokAccess } from "./byok";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export type VercelRuntime={clientID:string;clientSecret:string;slug:string;origin:string;platformTeam:string};
function settings(runtime?:VercelRuntime) {
  const clientID = runtime?.clientID??process.env.WEBDOCK_BYOK_VERCEL_CLIENT_ID,
    clientSecret = runtime?.clientSecret??process.env.WEBDOCK_BYOK_VERCEL_CLIENT_SECRET,
    slug = runtime?.slug??process.env.WEBDOCK_BYOK_VERCEL_INTEGRATION_SLUG;
  const origin = runtime?.origin??process.env.WEBDOCK_STUDIO_ORIGIN;
  const platformTeam = runtime?.platformTeam??process.env.WEBDOCK_VERCEL_TEAM_ID;
  if (
    (runtime&&runtime.origin!==process.env.WEBDOCK_STUDIO_ORIGIN)||
    !platformTeam ||
    !/^team_[A-Za-z0-9]+$/.test(platformTeam) ||
    !clientID ||
    !clientSecret ||
    !slug ||
    !origin ||
    !/^https:\/\/[a-z0-9.-]+$/.test(origin) ||
    !/^[a-z0-9-]+$/.test(slug)
  )
    throw new HostingError(
      503,
      "Customer Vercel connections are not configured yet.",
    );
  return {
    clientID,
    clientSecret,
    slug,
    platformTeam,
    callback: origin + "/api/vercel/callback",
  };
}
export async function vercelJSON(
  path: string,
  token?: string,
  teamID?: string,
  init: RequestInit = {},
) {
  const url = new URL(path, "https://api.vercel.com");
  if (url.origin !== "https://api.vercel.com")
    throw new HostingError(400, "Invalid provider endpoint.");
  if (teamID) url.searchParams.set("teamId", teamID);
  try {
    const r = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...init.headers,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok)
      throw new HostingError(
        r.status === 403 ? 403 : 502,
        "Vercel could not complete this request. Check the connection and project permissions.",
      );
    const reader = r.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 2_000_000) {
          await reader.cancel();
          throw Error();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(chunks).toString()) as any;
  } catch (e) {
    if (e instanceof HostingError) throw e;
    throw new HostingError(
      502,
      "Vercel is unavailable. Check the current state before retrying.",
    );
  }
}
export async function executeByokVercel(
  actor: HostingActor,
  cmd: HostingCommand,
  runtime?:VercelRuntime,
): Promise<any> {
  return transaction(async (db) => {
    if (cmd.action === "byok.vercel.finish") {
      if (actor.source !== "studio")
        throw new HostingError(403, "Connect Vercel in Studio.");
      const flow = (
        await db.query(
          "UPDATE webdock_auth.hosting_vercel_flow SET consumed=true WHERE state_hash=$1 AND subject=$2 AND session_id=$3 AND NOT consumed AND expires_at>now() RETURNING customer_id",
          [hash(cmd.state), actor.subject, actor.sessionID],
        )
      ).rows[0];
      if (!flow)
        throw new HostingError(
          403,
          "This connection attempt expired. Start again.",
        );
      await byokAccess(db, actor, flow.customer_id, true, "vercel");
      await planLock(db, flow.customer_id);
      const config = settings(runtime);
      const token = await vercelJSON(
        "/v2/oauth/access_token",
        undefined,
        undefined,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: config.clientID,
            client_secret: config.clientSecret,
            code: cmd.code,
            redirect_uri: config.callback,
          }),
        },
      );
      if (
        token.team_id !== cmd.teamID ||
        token.installation_id !== cmd.configurationID ||
        typeof token.access_token !== "string" ||
        token.access_token.length > 8192 ||
        token.token_type?.toLowerCase() !== "bearer"
      )
        throw new HostingError(403, "Vercel connection could not be verified.");
      const installation = await vercelJSON(
        "/v1/integrations/configuration/" + cmd.configurationID,
        token.access_token,
        cmd.teamID,
      );
      if (
        installation.id !== cmd.configurationID ||
        installation.teamId !== cmd.teamID ||
        installation.integrationId !== config.clientID ||
        installation.disabledAt ||
        installation.deletedAt ||
        installation.deleteRequestedAt ||
        !Array.isArray(installation.scopes) ||
        !installation.scopes.includes("read:integration-configuration") ||
        !installation.scopes.some((s: string) =>
          ["read:deployment", "read-write:deployment"].includes(s),
        ) ||
        !installation.scopes.some((s: string) =>
          ["read:domain", "read-write:domain"].includes(s),
        ) ||
        !installation.scopes.some((s: string) =>
          ["read:project", "read-write:project"].includes(s),
        )
      )
        throw new HostingError(403, "Vercel connection could not be verified.");
      // A Vercel team has exactly one canonical tenant owner in Webdock.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "byok-vercel:" + cmd.teamID,
      ]);
      const other = (
        await db.query(
          "SELECT customer_id FROM webdock_auth.hosting_vercel WHERE team_id=$1 AND customer_id<>$2",
          [cmd.teamID, flow.customer_id],
        )
      ).rowCount;
      if (other || cmd.teamID === config.platformTeam)
        throw new HostingError(
          409,
          "This Vercel team is already assigned to another connection.",
        );
      const encrypted = encryptMailSecret(
        { token: token.access_token, scopes: installation.scopes },
        "byok-vercel:" + flow.customer_id + ":" + cmd.teamID,
      );
      await db.query(
        "INSERT INTO webdock_auth.hosting_vercel(customer_id,team_id,configuration_id,encrypted_token) VALUES($1,$2,$3,$4) ON CONFLICT(customer_id) DO UPDATE SET team_id=$2,configuration_id=$3,encrypted_token=$4,projects='[]',revision=hosting_vercel.revision+1,connected_at=now()",
        [flow.customer_id, cmd.teamID, cmd.configurationID, encrypted],
      );
      await audit(db, actor, cmd.action, flow.customer_id);
      return { customerID: flow.customer_id };
    }
    if (!("customerID" in cmd))
      throw new HostingError(400, "Invalid Vercel request.");
    const read = ["byok.vercel.projects", "byok.vercel.resources"].includes(
      cmd.action,
    );
    const access = await byokAccess(db, actor, cmd.customerID, !read, "vercel");
    if (!access.liveReads)
      throw new HostingError(403, "Customer preview is read-only.");
    if (cmd.action === "byok.vercel.begin") {
      if (actor.source !== "studio")
        throw new HostingError(403, "Connect Vercel in Studio.");
      const config = settings(runtime),
        state = randomBytes(32).toString("base64url");
      await planLock(db, cmd.customerID);
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM webdock_auth.hosting_vercel_flow WHERE customer_id=$1 AND expires_at>now()",
          [cmd.customerID],
        )
      ).rows[0].n;
      if (count >= 5)
        throw new HostingError(429, "Wait before starting another connection.");
      await db.query(
        "INSERT INTO webdock_auth.hosting_vercel_flow(state_hash,customer_id,subject,session_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
        [hash(state), cmd.customerID, actor.subject, actor.sessionID],
      );
      return {
        url: `https://vercel.com/integrations/${config.slug}/new?state=${state}`,
      };
    }
    await planLock(db, cmd.customerID);
    const connection = (
      await db.query(
        "SELECT * FROM webdock_auth.hosting_vercel WHERE customer_id=$1 FOR UPDATE",
        [cmd.customerID],
      )
    ).rows[0];
    if (!connection)
      throw new HostingError(409, "Connect your Vercel team first.");
    const credential = decryptMailSecret<{ token: string; scopes: string[] }>(
      connection.encrypted_token,
      "byok-vercel:" + cmd.customerID + ":" + connection.team_id,
    );
    const options = { token: credential.token, teamID: connection.team_id };
    if (cmd.action === "byok.vercel.disconnect") {
      if (connection.revision !== cmd.revision)
        throw new HostingError(409, "Settings changed. Refresh and try again.");
      await db.query(
        "DELETE FROM webdock_auth.hosting_vercel WHERE customer_id=$1",
        [cmd.customerID],
      );
      await audit(db, actor, cmd.action, cmd.customerID);
      return { disconnected: true };
    }
    if (
      cmd.action === "byok.vercel.projects" ||
      cmd.action === "byok.vercel.select"
    ) {
      const projects: { id: string; name: string }[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 10; i++) {
        const page = await listVercelProjects({
          ...options,
          cursor: cursor ?? undefined,
        });
        projects.push(...page.projects);
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      if (cmd.action === "byok.vercel.projects")
        return {
          projects: access.canWrite
            ? projects
            : projects.filter((p) => connection.projects.includes(p.id)),
          selected: connection.projects,
          revision: connection.revision,
          complete: !cursor,
        };
      if (connection.revision !== cmd.revision)
        throw new HostingError(409, "Settings changed. Refresh and try again.");
      if (cmd.projects.some((id) => !projects.some((p) => p.id === id)))
        throw new HostingError(
          403,
          "Choose projects available to this Vercel connection.",
        );
      await db.query(
        "UPDATE webdock_auth.hosting_vercel SET projects=$2,revision=revision+1 WHERE customer_id=$1",
        [cmd.customerID, JSON.stringify([...new Set(cmd.projects)])],
      );
      await audit(db, actor, cmd.action, cmd.customerID);
      return { saved: true };
    }
    if (!("projectID" in cmd) || !connection.projects.includes(cmd.projectID))
      throw new HostingError(404, "Vercel project is unavailable.");
    if (cmd.action === "byok.vercel.resources")
      return {
        ...(await fetchVercelProject({ ...options, projectID: cmd.projectID })),
        usage: null,
        canSetRegion: credential.scopes.includes("read-write:project"),
        canCancel: credential.scopes.includes("read-write:deployment"),
      };
    // Verify project membership fresh before any provider mutation.
    const project = await vercelJSON(
      "/v9/projects/" + cmd.projectID,
      credential.token,
      connection.team_id,
    );
    if (
      project.id !== cmd.projectID ||
      project.accountId !== connection.team_id
    )
      throw new HostingError(404, "Vercel project is unavailable.");
    if (cmd.action === "byok.vercel.region") {
      if (!credential.scopes.includes("read-write:project"))
        throw new HostingError(
          403,
          "Reconnect Vercel with project management permission.",
        );
      await vercelJSON(
        "/v9/projects/" + cmd.projectID,
        credential.token,
        connection.team_id,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            functionDefaultRegions: ["fra1"],
            functionZeroConfigFailover: false,
          }),
        },
      );
    } else if (cmd.action === "byok.vercel.cancel") {
      if (!credential.scopes.includes("read-write:deployment"))
        throw new HostingError(
          403,
          "Reconnect Vercel with deployment management permission.",
        );
      const deployment = await vercelJSON(
        "/v13/deployments/" + cmd.deploymentID,
        credential.token,
        connection.team_id,
      );
      if (
        deployment.projectId !== cmd.projectID ||
        !["QUEUED", "BUILDING", "INITIALIZING"].includes(deployment.readyState)
      )
        throw new HostingError(409, "This deployment cannot be canceled.");
      await vercelJSON(
        "/v12/deployments/" + cmd.deploymentID + "/cancel",
        credential.token,
        connection.team_id,
        { method: "PATCH" },
      );
    } else throw new HostingError(400, "Invalid Vercel request.");
    await audit(db, actor, cmd.action, cmd.projectID);
    return { saved: true };
  });
}
