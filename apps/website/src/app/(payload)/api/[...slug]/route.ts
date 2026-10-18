import { guardNativeCMSMutation } from '@/lib/cms-bridge-policy';
import config from '@payload-config';
import { REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST, REST_PUT } from '@payloadcms/next/routes';
export const GET = REST_GET(config);
export const POST = guardNativeCMSMutation(REST_POST(config));
export const DELETE = guardNativeCMSMutation(REST_DELETE(config));
export const PATCH = guardNativeCMSMutation(REST_PATCH(config));
export const PUT = guardNativeCMSMutation(REST_PUT(config));
export const OPTIONS = REST_OPTIONS(config);
