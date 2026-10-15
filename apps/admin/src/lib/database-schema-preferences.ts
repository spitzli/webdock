import type { TabularisClient } from "@tabularis/web-ui";

type Preferences = { selectedSchemas?: string[]; activeSchema?: string };
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
type Scope = {
  userID: string;
  bindingID: string;
  kind: "managed" | "registered";
  connectionID: string;
};
const schemaName = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 1024 &&
  !value.includes("\0");
const schemaNames = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 512 && value.every(schemaName);

function read(storage: PreferenceStorage, key: string): Preferences {
  const raw = storage.getItem(key);
  if (!raw || raw.length > 524288) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some(
        (key) => key !== "selectedSchemas" && key !== "activeSchema",
      )
    )
      return {};
    if ("selectedSchemas" in value && !schemaNames(value.selectedSchemas))
      return {};
    if ("activeSchema" in value && !schemaName(value.activeSchema)) return {};
    return value as Preferences;
  } catch {
    return {};
  }
}

/** Keep schema choices across ephemeral runtimes without bypassing gateway authorization. */
export function rememberDatabaseSchemas(
  client: Pick<TabularisClient, "call">,
  scope: Scope,
  storage: () => PreferenceStorage = () => window.localStorage,
): void {
  const key =
    "webdock:database-schemas:v1:" +
    JSON.stringify([scope.userID, scope.kind, scope.bindingID]);
  const call = client.call.bind(client);
  client.call = async (command, request, options) => {
    const response = await call(command, request, options);
    if (
      ![
        "get_selected_schemas",
        "set_selected_schemas",
        "get_schema_preference",
        "set_schema_preference",
      ].includes(command) ||
      !request ||
      typeof request !== "object" ||
      !("connectionId" in request) ||
      request.connectionId !== scope.connectionID
    )
      return response;
    try {
      const target = storage(),
        preferences = read(target, key);
      if (
        command === "get_selected_schemas" &&
        preferences.selectedSchemas !== undefined
      )
        return preferences.selectedSchemas as typeof response;
      if (
        command === "get_schema_preference" &&
        preferences.activeSchema !== undefined
      )
        return preferences.activeSchema as typeof response;
      if (
        command === "set_selected_schemas" &&
        "schemas" in request &&
        schemaNames(request.schemas)
      ) {
        preferences.selectedSchemas = request.schemas;
        target.setItem(key, JSON.stringify(preferences));
      }
      if (
        command === "set_schema_preference" &&
        "schema" in request &&
        schemaName(request.schema)
      ) {
        preferences.activeSchema = request.schema;
        target.setItem(key, JSON.stringify(preferences));
      }
    } catch {
      /* Browser storage is optional; retain the successful upstream result. */
    }
    return response;
  };
}
