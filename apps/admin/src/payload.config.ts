import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import nodemailer from "nodemailer";
import {
  Users,
  Customers,
  Projects,
  Instances,
  Audit,
} from "./cms/collections";
import { isOperator } from "./lib/instance-users";
const dirname = path.dirname(fileURLToPath(import.meta.url));
const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3120";
export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || "",
  serverURL,
  routes: { admin: "/system" },
  admin: {
    user: "users",
    importMap: { baseDir: dirname },
    meta: { titleSuffix: "— Webdock Admin" },
  },
  collections: [Users, Customers, Projects, Instances, Audit],
  jobs: { access: { run: isOperator, queue: isOperator, cancel: isOperator } },
  db: postgresAdapter({
    schemaName: "webdock_admin",
    disableCreateDatabase: true,
    push: false,
    allowIDOnCreate: true,
    pool: {
      connectionString:
        process.env.PAYLOAD_MIGRATING === "true"
          ? process.env.DATABASE_URL_UNPOOLED
          : process.env.DATABASE_URL,
      max: 4,
    },
    migrationDir: path.resolve(dirname, "migrations"),
  }),
  ...(process.env.SMTP_HOST
    ? {
        email: nodemailerAdapter({
          defaultFromAddress: process.env.SMTP_FROM || "noreply@webdock.dev",
          defaultFromName: "Webdock",
          skipVerify: true,
          transport: nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 465),
            secure: process.env.SMTP_PORT !== "587",
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            disableFileAccess: true,
            disableUrlAccess: true,
          }),
        }),
      }
    : {}),
  graphQL: { disable: true },
  csrf: [serverURL],
  cors: [serverURL],
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
});
