import { sso } from "../../../../lib/sso.ts";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  sso
    ? sso.login(request)
    : Response.json(
        { error: "Direct SSO is not configured; use the project Console." },
        { status: 503 },
      );
