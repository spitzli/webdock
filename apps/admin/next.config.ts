import path from 'node:path';
import type {NextConfig} from 'next';
import {withPayload} from '@payloadcms/next/withPayload';
const config:NextConfig={transpilePackages:['@webdock/payload-sso','@webdock/instance-kit','@webdock/snowflake'],outputFileTracingRoot:path.resolve(process.cwd(),'../..'),turbopack:{root:path.resolve(process.cwd(),'../..')},async headers(){return[{source:'/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Content-Type-Options',value:'nosniff'}]}];}};
export default withPayload(config);
