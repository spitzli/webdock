"use client";
import * as React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function HostingRefresh({
  active,
  interval = 5000,
}: {
  active: boolean;
  interval?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, interval);
    return () => clearInterval(timer);
  }, [active, interval, router]);
  return null;
}
