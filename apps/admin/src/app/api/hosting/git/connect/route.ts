import { hostingCall } from "@/lib/hosting-client";
import { gitConnectionRoute } from "@/lib/git-connection-routes";
export async function POST(request: Request) {
  const origin = process.env.NEXT_PUBLIC_SERVER_URL;
  if (!origin) return new Response(null, { status: 503 });
  return gitConnectionRoute(request, "connect", {
    origin,
    call: (command) => hostingCall(command),
  });
}
