import type { NextConfig } from 'next';
import { withPayload } from '@payloadcms/next/withPayload';
const nextConfig: NextConfig = { turbopack: { root: process.cwd() } };
export default withPayload(nextConfig);
