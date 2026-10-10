"use client";
import { useI18n } from '@webdock/i18n/react';


import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Explicit public props: never pass the server access object or bridge here.
export function CmsWorkspaceNav({ links }: { links: { label: string; href: string }[] }) {
  const i18n = useI18n();

  const pathname = usePathname();
  const search = useSearchParams();
  return <nav className="cms-workspace-nav" aria-label={i18n.t("CMS areas")}>
    {links.map(link => {
      const [path, query] = link.href.split("?");
      const selected = pathname === path && (!query || new URLSearchParams(query).get("kind") === (search.get("kind") || "products"));
      return <Link key={link.href} href={link.href} aria-current={selected ? "page" : undefined}>{i18n.t(link.label)}</Link>;
    })}
  </nav>;
}
