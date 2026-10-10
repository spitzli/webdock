import {previewProjectDeletion,deleteProject,deleteProjectInput} from "./project-deletion";
import { projectVercelStatus } from "./vercel-project";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { APIError } from "payload";
import {
  customerInput,
  projectInput,
  instanceInput,
  listInput,
  recordID,
  collectionName,
  listRecords,
  getRecord,
  writeCustomer,
  writeProject,
  writeInstance,
  setArchived,
  type RegistryActor,
} from "./registry";
export const mutationTools = new Set([
  "save_customer",
  "save_project",
  "save_cms_connection",
  "set_archived",
  "delete_project",
]);
export function createRegistryMCP(actor: RegistryActor, canWrite: boolean) {
  const server = new McpServer({ name: "webdock-studio", version: "1.0.0" });
  const result = async (run: () => Promise<unknown>) => {
    try {
      const data = await run();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              error instanceof APIError && error.isPublic
                ? error.message
                : error instanceof z.ZodError
                  ? error.issues.map((i) => i.message).join("; ")
                  : "The operation failed. No change was confirmed.",
          },
        ],
      };
    }
  };
  server.registerTool(
    "list_records",
    {
      description:
        "List Webdock customers, projects, CMS inventory or audit activity. Filter projects by customer, CMS inventory by project, and activity by targetCollection/targetID. Search, sort and paginate; no secrets or user accounts.",
      inputSchema: listInput.shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input) => result(() => listRecords(actor, input)),
  );
  server.registerTool(
    "get_record",
    {
      description: "Read one registry record by its string Snowflake ID.",
      inputSchema: { collection: collectionName, id: recordID },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ collection, id }) => result(() => getRecord(actor, collection, id)),
  );
  server.registerTool(
    "get_hosting_status",
    {
      description:
        "Read live Vercel deployment and domain information for a Studio project. Never deploys or changes Vercel settings.",
      inputSchema: { projectID: recordID },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ projectID }) => result(() => projectVercelStatus(actor, projectID)),
  );
  server.registerTool("preview_project_deletion", {description:"Preview permanent removal of an isolated managed project: hosting, CMS database and website login. Platform operators only; no mutation.",inputSchema:{projectID:recordID},annotations:{readOnlyHint:true,openWorldHint:true}},({projectID})=>result(()=>previewProjectDeletion(actor,projectID)));
  if (canWrite) {
    server.registerTool("delete_project", {description:"Permanently remove the exact project, hosting, isolated CMS database and website access shown in preview_project_deletion. Requires its planHash and exact project name. Retains customer/user records and audit history. Repeating the same confirmed plan resumes recorded progress.",inputSchema:{projectID:recordID,...deleteProjectInput.shape},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:true}},({projectID,...input})=>result(()=>deleteProject(actor,projectID,input)));
    const annotations = {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    };
    server.registerTool(
      "save_customer",
      {
        description:
          "Create or edit a customer. Omit id to create; supply all required fields to edit. Does not create identity accounts.",
        inputSchema: { id: recordID.optional(), data: customerInput },
        annotations,
      },
      ({ id, data }) => result(() => writeCustomer(actor, id || null, data)),
    );
    server.registerTool(
      "save_project",
      {
        description:
          "Create or edit a project. Never provisions a CMS. Customer ownership cannot be changed.",
        inputSchema: { id: recordID.optional(), data: projectInput },
        annotations,
      },
      ({ id, data }) => result(() => writeProject(actor, id || null, data)),
    );
    server.registerTool(
      "save_cms_connection",
      {
        description:
          "Record an already deployed CMS connection. Changes inventory only, never infrastructure. Existing project assignment is immutable.",
        inputSchema: {
          id: recordID.optional(),
          data: instanceInput,
          confirmExisting: z.boolean(),
        },
        annotations,
      },
      ({ id, data, confirmExisting }) =>
        result(() => writeInstance(actor, id || null, data, confirmExisting)),
    );
    server.registerTool(
      "set_archived",
      {
        description:
          "Archive or restore a customer/project. Requires linked active projects/CMS to be retired first. Does not delete data.",
        inputSchema: {
          collection: z.enum(["customers", "projects"]),
          id: recordID,
          archived: z.boolean(),
        },
        annotations: { ...annotations, idempotentHint: true },
      },
      ({ collection, id, archived }) =>
        result(() => setArchived(actor, collection, id, archived)),
    );
  }
  return server;
}
