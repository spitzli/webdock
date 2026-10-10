import {getCMS} from '@/lib/server';
import {vercelRegionEvent} from '@/lib/vercel-region-policy';
export const runtime='nodejs';
export const POST=(request:Request)=>vercelRegionEvent(request,{getCMS});
