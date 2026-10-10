import 'server-only';
import {sso} from './sso';
import {getStudioSession} from './studio-client';
import {previewDenial} from './preview-guard-policy';
/** Keep this before native dispatch, never inside Payload auth strategies or access hooks. */
export function operatorPreviewDenial(requestHeaders:Headers){
 return previewDenial(requestHeaders,{hasSSOCookie:headers=>!!sso?.hasSessionCookie(headers),getSession:getStudioSession});
}
