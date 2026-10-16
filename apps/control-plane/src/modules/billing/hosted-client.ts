import { createHostedPolarClient } from "@webdock/adapter-billing-polar/hosted";
export const hostedPolarClient = createHostedPolarClient(() => ({
  server: process.env.POLAR_SERVER,
  accessToken: process.env.POLAR_ACCESS_TOKEN,
}));
