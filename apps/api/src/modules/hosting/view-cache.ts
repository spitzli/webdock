import type { HostingActor } from "@webdock/hosting-contracts";
import { readCachedView } from "../../cache";
import type { Connection } from "./authorization";

type Options = Parameters<typeof readCachedView>[0] & { tables: string[] };

/** Call only after live resource authorization; cache keys never grant access. */
export function readHostingView<T>(
  db: Connection,
  actor: HostingActor,
  { tables, ...key }: Options,
  load: () => Promise<T>,
): Promise<T> {
  return readCachedView(
    {
      ...key,
      scope: {
        ...key.scope,
        subject: actor.subject,
        sessionID: actor.sessionID,
        source: actor.source,
        scopes: [...actor.scopes].sort().join(" "),
        gitSourceID: actor.gitSourceID ?? null,
        gitSourceRevision: actor.gitSourceRevision ?? null,
      },
    },
    async () =>
      (
        await db.query("SELECT webdock_cache.version($1::text[]) AS version", [
          tables,
        ])
      ).rows[0].version,
    load,
  );
}
