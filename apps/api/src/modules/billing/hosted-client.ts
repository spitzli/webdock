import { createPolar } from "@polar-sh/sdk/2026-10";
import { z } from "zod";

let client: ReturnType<typeof createPolar> | undefined;
export function hostedPolarClient() {
  if (!client) {
    const environment = z
      .enum(["sandbox", "production"])
      .parse(process.env.POLAR_SERVER);
    const accessToken = process.env.POLAR_ACCESS_TOKEN;
    if (!accessToken) throw Error("Polar hosted checkout is not configured.");
    client = createPolar({ environment, accessToken, timeout: 15 });
  }
  return client;
}
