import { operatorPreviewDenial } from "@/lib/preview-guard";
import { guardNativeHandler } from "@/lib/preview-guard-policy";
import config from "@payload-config";
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from "@payloadcms/next/routes";
const protect = (handler: ReturnType<typeof REST_GET>) => guardNativeHandler(handler, operatorPreviewDenial);
export const GET = protect(REST_GET(config));
export const POST = protect(REST_POST(config));
export const DELETE = protect(REST_DELETE(config));
export const PATCH = protect(REST_PATCH(config));
export const PUT = protect(REST_PUT(config));
export const OPTIONS = protect(REST_OPTIONS(config));
