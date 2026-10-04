import config from '@payload-config';
import { requireCMSOperator } from '@/lib/cms';
import '@payloadcms/next/css';
import type { ServerFunctionClient } from 'payload';
import { generatePayloadViewport, handleServerFunctions, RootLayout } from '@payloadcms/next/layouts';
import { importMap } from './system/importMap';

export const generateViewport = generatePayloadViewport;
const serverFunction: ServerFunctionClient = async (args) => {
  'use server';
  await requireCMSOperator();
  return handleServerFunctions({ ...args, config, importMap });
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireCMSOperator();
  return <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>{children}</RootLayout>;
}
