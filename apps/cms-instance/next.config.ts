import path from "node:path";
import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";
const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: [
    "@webdock/cms-ui",
    "@webdock/cms-bridge",
    "@webdock/payload-sso",
    "@webdock/instance-kit",
    "@webdock/i18n",
  ],
  turbopack: { root: path.resolve(process.cwd(), "../..") },
};
export default withPayload(config);
