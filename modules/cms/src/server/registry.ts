import { and, eq, sql } from "drizzle-orm";
import * as schema from "@webdock/platform-db/schema/registry";
import { instanceInput, recordID } from "@webdock/core/registry/contracts";
import { RegistryError } from "@webdock/core/registry/errors";
import type { RegistryCmsExtension } from "@webdock/core/registry/ports";

/** Composed even when CMS is disabled: retained instances still block archiving. */
export function createCmsRegistryExtension(
  requireProduct: (product: "cms", intent: "access" | "provision") => void,
): RegistryCmsExtension {
  return {
    table: schema.cmsInstances,
    prepareWrite(key, input, confirmExisting) {
      requireProduct("cms", key === null ? "provision" : "access");
      if (key !== null) recordID.parse(key);
      const data = instanceInput.parse(input);
      if (!key && !confirmExisting)
        throw new RegistryError("Confirm that this CMS is already deployed.");
      return async ({ tx, localID, id, audit }) => {
        const old = key
          ? (
              await tx
                .select()
                .from(schema.cmsInstances)
                .where(eq(schema.cmsInstances.id, recordID.parse(key)))
                .for("update")
            )[0]
          : undefined;
        if (key && !old)
          throw new RegistryError("CMS connection unavailable.", 404);
        if (old && old.project !== data.project)
          throw new RegistryError(
            "A CMS instance cannot move between projects.",
          );
        const parent = (
          await tx
            .select()
            .from(schema.projects)
            .where(eq(schema.projects.id, data.project))
            .for("share")
        )[0];
        if (!parent || parent.status !== "active")
          throw new RegistryError("Choose an active project.");
        const rows = old
          ? await tx
              .update(schema.cmsInstances)
              .set({ ...data, updatedAt: new Date() })
              .where(eq(schema.cmsInstances.id, old.id))
              .returning()
          : await tx
              .insert(schema.cmsInstances)
              .values({ ...data, id: await id(tx) })
              .returning();
        await audit(tx, localID, "cms-instances", old, rows[0]);
        return rows[0];
      };
    },
    async beforeArchiveProject(tx, key) {
      const linked = await tx
        .select({ id: schema.cmsInstances.id })
        .from(schema.cmsInstances)
        .where(
          and(
            eq(schema.cmsInstances.project, key),
            sql`${schema.cmsInstances.status} <> 'retired'`,
          ),
        )
        .limit(1);
      if (linked.length)
        throw new RegistryError(
          "Retire the linked CMS before archiving this project.",
        );
    },
  };
}
