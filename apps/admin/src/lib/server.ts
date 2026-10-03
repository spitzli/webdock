import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@payload-config";
export const getCMS = cache(() => getPayload({ config }));
export const requireOperator = cache(async () => {
  const payload = await getCMS();
  const { user } = await payload.auth({ headers: await headers() });
  if (!user || user.collection !== "users" || user.role !== "operator")
    redirect("/login");
  return { payload, user };
});
