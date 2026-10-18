import type { Metadata } from 'next';
import config from '@payload-config';
import { RootPage, generatePageMetadata } from '@payloadcms/next/views';
import { requireCMSOperator } from '@/lib/cms';
import { importMap } from '../importMap';

type Args = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] }>;
};
export const generateMetadata = async ({ params, searchParams }: Args): Promise<Metadata> => { await requireCMSOperator(); return generatePageMetadata({ config, params, searchParams }); };

export default async function Page({ params, searchParams }: Args) {
  await requireCMSOperator();
  return RootPage({ config, params, searchParams, importMap });
}
