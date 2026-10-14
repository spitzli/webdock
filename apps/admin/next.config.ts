import path from 'node:path';
import type {NextConfig} from 'next';
const config:NextConfig={outputFileTracingExcludes:{'/*':['./.env*','../../**/.env*','../../.superpowers/**/*']},experimental:{globalNotFound:true,serverActions:{bodySizeLimit:'2mb',allowedOrigins:['studio.webdock.dev']}},transpilePackages:['@webdock/search','@webdock/hosting-contracts','@webdock/i18n','@webdock/payload-sso','@webdock/page-builder'],outputFileTracingRoot:path.resolve(process.cwd(),'../..'),turbopack:{root:path.resolve(process.cwd(),'../..')},async headers(){return[{source:'/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Content-Type-Options',value:'nosniff'}]}];}};
export default config;
