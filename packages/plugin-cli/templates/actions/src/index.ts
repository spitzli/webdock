import {readFileSync} from 'node:fs';
import {createActionServer} from './runtime.js';

function required(name:string):string {
 const value=process.env[name];
 if(!value) throw Error(`Missing ${name}`);
 return value;
}

const server=createActionServer({
 pluginID:required('WEBDOCK_PLUGIN_ID'),
 version:required('WEBDOCK_PLUGIN_VERSION'),
 generation:Number(required('WEBDOCK_PLUGIN_GENERATION')),
 hostURL:required('WEBDOCK_PLUGIN_HOST_URL'),
 runtimeToken:required('WEBDOCK_PLUGIN_RUNTIME_TOKEN'),
 publicKey:required('WEBDOCK_PLUGIN_PUBLIC_KEY'),
 cert:readFileSync(required('WEBDOCK_PLUGIN_TLS_CERT')),
 key:readFileSync(required('WEBDOCK_PLUGIN_TLS_KEY')),
});
server.listen(3443,'0.0.0.0');
process.on('SIGTERM',()=>{
 server.close(()=>process.exit(0));
 setTimeout(()=>process.exit(1),10000).unref();
});
