import {mailOpenAPI} from '../../../../../lib/mail-product/openapi';
export function GET(){return Response.json(mailOpenAPI(),{headers:{'Cache-Control':'public, max-age=300'}});}
