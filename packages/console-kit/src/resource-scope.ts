/** Only resource identity enters React keys; never serialize secrets or action payloads. */
export function resourceScope(input: unknown): string {
  const values: string[] = [];
  const collect = (value: unknown, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 3) return;
    const data = value as Record<string, unknown>;
    for (const field of [
      "action",
      "userID",
      "bindingID",
      "customerID",
      "projectID",
      "appID",
      "databaseID",
      "connectionID",
      "domainID",
      "clusterID",
      "enrollmentID",
      "setupID",
      "id",
    ])
      if (typeof data[field] === "string")
        values.push(field + ":" + data[field]);
    for (const field of [
      "command",
      "options",
      "project",
      "view",
      "initial",
      "service",
    ])
      collect(data[field], depth + 1);
  };
  collect(input);
  if (input && typeof input === "object" && "managed" in input)
    values.push("managed:" + String(input.managed));
  return values.join("|") || "hosting";
}
