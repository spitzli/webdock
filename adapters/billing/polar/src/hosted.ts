import { createPolar } from "@polar-sh/sdk/2026-10";
import { z } from "zod";

export function createHostedPolarClient(
  configuration: () => {
    server: string | undefined;
    accessToken: string | undefined;
  },
) {
  let client: ReturnType<typeof createPolar> | undefined;
  return function hostedPolarClient() {
    if (!client) {
      const environment = z
        .enum(["sandbox", "production"])
        .parse(configuration().server);
      const accessToken = configuration().accessToken;
      if (!accessToken) throw Error("Polar hosted checkout is not configured.");
      client = createPolar({ environment, accessToken, timeout: 15 });
    }
    return client;
  };
}
