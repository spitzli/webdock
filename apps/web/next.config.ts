import path from 'node:path';
import type { NextConfig } from 'next';
import { withPayload } from '@payloadcms/next/withPayload';
const nextConfig: NextConfig = { transpilePackages:['@webdock/payload-sso','@webdock/instance-kit','@webdock/cms-ui'],outputFileTracingRoot:path.resolve(process.cwd(),'../..'),turbopack: { root: path.resolve(process.cwd(), '../..') } };
export default withPayload(nextConfig);
