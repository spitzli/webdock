import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sso } from "@/lib/sso";
import config from "@payload-config";
import { RootPage, generatePageMetadata } from "@payloadcms/next/views";
import { importMap } from "../importMap";
type Args = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] }>;
};
export const generateMetadata = ({
  params,
  searchParams,
}: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams });
export default async function Page({ params, searchParams }: Args) {
  if (sso || process.env.WEBDOCK_SSO_ENFORCE === "true") {
    const { segments = [] } = await params;
    if (["login", "forgot", "reset", "create-first-user"].includes(segments[0])) redirect("/api/sso/login");
    if (segments[0] === "account" || (segments[0] === "collections" && segments[1] === "users")) redirect("/");
  }
  return RootPage({ config, params, searchParams, importMap });
}
