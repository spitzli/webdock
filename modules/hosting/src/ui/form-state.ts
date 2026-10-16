"use client";
import { createContext } from "react";
export const HostingSaveContext = createContext<{
  message?: string;
  error?: string;
  environmentReset?: boolean;
}>({});
export const HostingPendingContext = createContext(false);
export const HostingDirtyContext = createContext<() => void>(() => {});
