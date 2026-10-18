import {
  hostingDimensions,
  HostingError,
  type HostingAllowances,
} from "./index";
/** Pure allocation arithmetic shared by application and database reservations. */
export function allocationTotals(
  rows: { demand: HostingAllowances; status: string }[],
) {
  const result = Object.fromEntries(
    hostingDimensions.map((k) => [k, 0]),
  ) as Record<(typeof hostingDimensions)[number], number>;
  for (const row of rows)
    for (const key of hostingDimensions) {
      const value =
        key === "concurrentDeployments" && row.status === "active"
          ? 0
          : (row.demand[key] ?? 0);
      result[key] =
        key === "replicasPerApp"
          ? Math.max(result[key], value)
          : result[key] + value;
      if (!Number.isSafeInteger(result[key]))
        throw new HostingError(
          409,
          "Allocated hosting resources exceed the supported range.",
        );
    }
  return result;
}
