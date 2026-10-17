import {isDeepStrictEqual} from 'node:util';
/** Preserve the actual configuration generation; JSONB key order and capability order are not semantic. */
export function preservedConfigurationRevision(previous:{revision:string;configuration:unknown;approved_capabilities:string[]},configuration:unknown,approved:string[]){
 if(!isDeepStrictEqual(previous.configuration,configuration)||!isDeepStrictEqual([...previous.approved_capabilities].sort(),[...approved].sort()))throw Error('This pilot update cannot change configuration or capabilities');
 if(!/^(0|[1-9][0-9]*)$/.test(String(previous.revision)))throw Error('Invalid configuration revision');return String(previous.revision);
}
