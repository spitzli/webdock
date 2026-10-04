import { handleStudioRequest } from "@/lib/studio-api";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleStudioRequest(request);
}
