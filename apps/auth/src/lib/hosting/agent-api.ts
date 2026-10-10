import { claimNativeMail, checkpointNativeMail, completeNativeMail } from "../mail-agent";
import {saveInventory,byokAgentConfig,claimByokOperation,completeByokOperation} from "./byok";
import { claimOperation, completeOperation } from "./operations";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  HostingError,
  hostingError,
  resourceID,
} from "@webdock/hosting-contracts";
import { database } from "../db";
import {
  authenticateAgent,
  consumeEnrollment,
  reportCluster,
} from "./clusters";
import { requireHostingEnvironment, readHostingJSON } from "./http";
const enrollment = z
  .object({ clusterID: resourceID, token: z.string().length(43) })
  .strict();
export async function hostingAgentAPI(request: Request, path: string[]) {
  try {
    requireHostingEnvironment();
    if (
      request.method !== "POST" ||
      path.length !== 1 ||
      !["enroll", "heartbeat", "claim", "complete", "inventory", "config", "byok-claim", "byok-complete", "mail-claim", "mail-checkpoint", "mail-complete"].includes(path[0])
    )
      throw new HostingError(404, "Agent endpoint is unavailable.");
    const input = await readHostingJSON(request,path[0]==="inventory"?2_000_000:65536);
    const credentials = request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    const clusterID = request.headers.get("x-webdock-cluster");
    // A bounded, shared window also limits attempts with freshly invented credentials.
    const agent =
      path[0] !== "enroll" && clusterID && credentials
        ? await authenticateAgent(clusterID, credentials)
        : null;
    if (path[0] !== "enroll" && !agent)
      throw new HostingError(401, "Cluster authentication failed.");
    const bucket =
      path[0] === "enroll"
        ? "enrollment"
        : `heartbeat:${resourceID.parse(clusterID)}`;
    const hash = createHash("sha256").update(bucket).digest("hex");
    const r = (
      await database.query(
        `INSERT INTO webdock_auth.hosting_rate(key_hash) VALUES($1) ON CONFLICT(key_hash) DO UPDATE SET requests=CASE WHEN hosting_rate.window_start<now()-interval '1 minute' THEN 1 ELSE hosting_rate.requests+1 END,window_start=CASE WHEN hosting_rate.window_start<now()-interval '1 minute' THEN now() ELSE hosting_rate.window_start END RETURNING requests`,
        [hash],
      )
    ).rows[0];
    if (r.requests > (path[0] === "enroll" ? 30 : 120))
      throw new HostingError(429, "Agent request rate exceeded.");
    let data;
    if (path[0] === "enroll") {
      const parsed = enrollment.parse(input);
      data = await consumeEnrollment(parsed.clusterID, parsed.token);
    } else {
      if (!credentials || !clusterID)
        throw new HostingError(401, "Cluster authentication failed.");
      if(path[0]==="mail-claim"){z.object({}).strict().parse(input);data=await claimNativeMail(agent!);}
      else if(path[0]==="mail-checkpoint")data=await checkpointNativeMail(agent!,input);
      else if(path[0]==="mail-complete")data=await completeNativeMail(agent!,input);
      else if(path[0]==="inventory")data=await saveInventory(agent!,input);
      else if(path[0]==="config"){z.object({}).strict().parse(input);data=await byokAgentConfig(agent!);}
      else if(path[0]==="byok-claim"){z.object({}).strict().parse(input);data=await claimByokOperation(agent!);}
      else if(path[0]==="byok-complete")data=await completeByokOperation(agent!,z.object({id:resourceID,generation:z.number().int().positive(),outcome:z.enum(["succeeded","failed"]),proof:z.unknown().optional()}).strict().parse(input));
      else if (path[0] === "heartbeat") data = await reportCluster(agent!, input);
      else if (path[0] === "claim") {
        z.object({}).strict().parse(input);
        data = await claimOperation(agent!);
      } else
        data = await completeOperation(
          agent!,
          z
            .object({
              id: resourceID,
              generation: z.number().int().positive(),
              outcome: z.enum(["succeeded", "failed"]),
              proof: z.unknown().optional(),
              error: z
                .enum([
                  "admission_rejected",
                  "rollout_timeout",
                  "ownership_conflict",
                  "execution_failed",
                ])
                .optional(),
            })
            .strict()
            .parse(input),
        );
    }
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safe = hostingError(error);
    return Response.json(
      { error: safe.message },
      { status: safe.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
