import {open,unlink,statfs} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sealSecret,openSecret} from '@webdock/mail-core/secrets';
const LIMIT=25*1024*1024,SEALED_LIMIT=48*1024*1024;
/** The directory must be a dedicated private retained volume, owned by the Mail service. */
export class PrivatePayloadStore{
 private directory:string;
 private key:string;
 constructor(directory:string,key:string){
  if(!isAbsolute(directory))throw Error('Private Mail storage requires an absolute path.');
  sealSecret(null,'payload-key-check',key);
  this.directory=directory;this.key=key;
 }
 private path(ref:string){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(ref))throw Error('Invalid Mail payload reference.');return join(this.directory,ref);}
 private purpose(customerID:string,ref:string){if(!/^[1-9][0-9]{0,18}$/.test(customerID))throw Error('Invalid Mail customer.');return `payload:${customerID}:${ref}`;}
 async put(customerID:string,body:Buffer){
  if(!Buffer.isBuffer(body) || !body.length || body.length>LIMIT)throw Error('Mail payload exceeds its size limit.');
  const ref=randomUUID(),path=this.path(ref),sealed=sealSecret(body.toString('base64'),this.purpose(customerID,ref),this.key);
  const space=await statfs(this.directory,{bigint:true});
  if(space.bavail*space.bsize<BigInt(Buffer.byteLength(sealed))*2n+104857600n)throw Error('Private Mail storage has insufficient free space.');
  const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await file.writeFile(sealed);await file.sync();}
  catch(error){await unlink(path).catch(()=>{});throw error;}
  finally{await file.close();}
  const directory=await open(this.directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try{await directory.sync();}finally{await directory.close();}
  return {ref,bytes:body.length};
 }
 async get(customerID:string,ref:string){
  const path=this.path(ref),purpose=this.purpose(customerID,ref);
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const stat=await file.stat();if(!stat.isFile() || stat.size>SEALED_LIMIT || stat.mode & 0o077)throw Error('Invalid private Mail payload.');
   // Bound the actual read even if the file changes after stat.
   const chunks:Buffer[]=[];let size=0;
   for await(const part of file.createReadStream({autoClose:false})){size+=part.length;if(size>SEALED_LIMIT)throw Error('Invalid private Mail payload.');chunks.push(part);}
   const encoded=openSecret<unknown>(Buffer.concat(chunks).toString('utf8'),purpose,this.key);
   if(typeof encoded!=='string')throw Error('Invalid private Mail payload.');
   const value=Buffer.from(encoded,'base64');if(!value.length || value.length>LIMIT || value.toString('base64')!==encoded)throw Error('Invalid private Mail payload.');return value;
  }finally{await file.close();}
 }
 /** Internal cleanup only; never expose an arbitrary reference deletion endpoint. */
 async remove(ref:string){try{await unlink(this.path(ref));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}
