import {MailError} from './access';
export async function readBoundedJson(request:Request,maxBytes=4_000_000):Promise<unknown>{
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>4_000_000)throw Error('Invalid JSON body limit');
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))throw new MailError(415,'unsupported_media_type','Use application/json');
 if(request.headers.has('content-encoding')&&request.headers.get('content-encoding')!=='identity')throw new MailError(415,'unsupported_encoding','Compressed request bodies are not supported');
 if(Number(request.headers.get('content-length'))>maxBytes)throw new MailError(413,'payload_too_large','Request body is too large');
 const reader=request.body?.getReader();if(!reader)throw new MailError(422,'invalid_json','JSON body is required');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maxBytes)throw new MailError(413,'payload_too_large','Request body is too large');chunks.push(part.value);}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}
  catch{throw new MailError(422,'invalid_json','Invalid JSON body');}
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
