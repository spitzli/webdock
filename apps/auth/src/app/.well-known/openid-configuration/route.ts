import { auth } from "@/lib/auth";
export const GET = (req: Request) =>
  auth.handler(
    new Request(
      new URL("/api/auth/.well-known/openid-configuration", req.url),
      req,
    ),
  );
