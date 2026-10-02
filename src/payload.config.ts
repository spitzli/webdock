import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import nodemailer from 'nodemailer';
import { nodemailerAdapter } from '@payloadcms/email-nodemailer';
import { LandingPage } from './cms/landing';
import { authenticated } from './cms/access';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3104';

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || '',
  serverURL,
  admin: { user: 'users', importMap: { baseDir: dirname } },
  collections: [{
    slug: 'users',
    admin: { useAsTitle: 'email' },
    auth: { maxLoginAttempts: 5, lockTime: 600000 },
    access: { admin: authenticated, create: authenticated, read: authenticated, update: authenticated, delete: authenticated },
    fields: [{ name: 'name', type: 'text' }],
  }],
  globals: [LandingPage],
  db: postgresAdapter({
    pool: { connectionString: process.env.PAYLOAD_MIGRATING === 'true' ? process.env.DATABASE_URL_UNPOOLED : process.env.DATABASE_URL, max: 3 },
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  email: nodemailerAdapter({
    defaultFromAddress: process.env.SMTP_FROM || 'noreply@webdock.dev',
    defaultFromName: 'Webdock',
    skipVerify: true,
    transport: nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    }),
  }),
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  graphQL: { disable: true },
});
