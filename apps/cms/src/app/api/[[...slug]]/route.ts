const retired = () => Response.json(
  { error: 'The shared CMS has been retired. Use the independent website CMS.' },
  { status: 410, headers: { 'Cache-Control': 'no-store' } },
);
export const GET = retired;
export const POST = retired;
export const PUT = retired;
export const PATCH = retired;
export const DELETE = retired;
export const OPTIONS = retired;
export const HEAD = retired;
