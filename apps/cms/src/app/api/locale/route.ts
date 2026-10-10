import {createPreferenceResponse} from '@webdock/i18n/preference';
export const POST=(request:Request)=>createPreferenceResponse(request,{canonicalOrigin:new URL(process.env.NEXT_PUBLIC_SERVER_URL||'https://cms.webdock.dev').origin});
