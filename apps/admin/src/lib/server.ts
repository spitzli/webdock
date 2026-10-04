import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config, { sso } from "@payload-config";
export const getCMS = cache(() => getPayload({ config }));
export const requireOperator = cache(async () => {
  const requestHeaders = await headers();
  if (sso) {
    const portal = await sso.getDelegatedSession(requestHeaders);
    if (portal && portal.role !== "operator") redirect("/tenants");
  }
  const payload = await getCMS();
  const { user } = await payload.auth({ headers: requestHeaders });
  if (!user || user.collection !== "users" || user.role !== "operator")
    redirect(sso ? "/api/sso/login" : "/login");
  return { payload, user };
});
