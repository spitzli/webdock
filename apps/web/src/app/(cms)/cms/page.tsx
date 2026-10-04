import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cmsUser } from '@webdock/cms-ui/server';
import { CMSApp } from '@webdock/cms-ui/client';
import { getCMS,cmsOptions } from '@/lib/cms';
export const dynamic='force-dynamic';
export default async function Page(){const user=await cmsUser(await getCMS(),await headers());if(!user)redirect('/api/sso/login?returnTo=/cms');const issuer=process.env.WEBDOCK_AUTH_ISSUER||'https://auth.webdock.dev/api/auth';return <CMSApp siteName={cmsOptions.siteName} siteURL={cmsOptions.siteURL} accountURL={new URL('/account',issuer).href} accessURL={new URL('/people',issuer).href} technicalURL="/system"/>;}
