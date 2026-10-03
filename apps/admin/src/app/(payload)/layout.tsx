import config from "@payload-config";
import "@payloadcms/next/css";
import type { ServerFunctionClient } from "payload";
import {
  generatePayloadViewport,
  handleServerFunctions,
  RootLayout,
} from "@payloadcms/next/layouts";
import { importMap } from "./system/importMap";

export const generateViewport = generatePayloadViewport;
const serverFunction: ServerFunctionClient = async (args) => {
  "use server";
  return handleServerFunctions({ ...args, config, importMap });
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RootLayout
      config={config}
      importMap={importMap}
      serverFunction={serverFunction}
    >
      {children}
    </RootLayout>
  );
}
