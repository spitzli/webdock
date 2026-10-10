import { gitWorkerAPI } from "@/lib/hosting/git-worker-api";
export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return gitWorkerAPI(request, (await context.params).path);
}
export const GET = POST;
