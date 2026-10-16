import "server-only";
import { auth } from "@clerk/nextjs/server";
import { cache } from "react";
export const clerkConsoleEnabled = () =>
  process.env.WEBDOCK_CONSOLE_AUTH_PROVIDER === "clerk";
export const getConsoleIdentity = cache(async () => {
  const identity = await auth();
  if (!identity.userId) return null;
  const token = await identity.getToken();
  if (!token) return null;
  const serviceKey = process.env.WEBDOCK_CONSOLE_SERVICE_KEY;
  if (!serviceKey || serviceKey.length < 32)
    throw Error("Console delegation is not configured.");
  return { token, serviceKey };
});
