import fs from 'node:fs';
import path from 'node:path';
import {copy} from '@vercel/blob';
const ledgerFile='.backups/instance-blob-copies.json';
const ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile,'utf8')):{};
for(const site of ['spitzli','stall']){
 const file=`.backups/${site}-current.json`;const data=JSON.parse(fs.readFileSync(file,'utf8'));
 if(data.mediaCopiedTo===`instances/${site}`){console.log(site,'media already copied');continue;}
 const prefix=`instances/${site}`;const sources=new Map();
 for(const media of data.media||[])for(const asset of [media,...Object.values(media.sizes||{})])if(asset?.url&&asset.filename)sources.set(asset.url,`${prefix}/${path.basename(asset.filename)}`);
 const jobs=[...sources.entries()];let position=0;
 await Promise.all(Array.from({length:6},async()=>{while(position<jobs.length){const [url,destination]=jobs[position++];const key=site+'|'+url;if(!ledger[key]){const result=await copy(url,destination,{access:'public',addRandomSuffix:false,token:process.env.BLOB_READ_WRITE_TOKEN});ledger[key]=result.url;fs.writeFileSync(ledgerFile,JSON.stringify(ledger,null,2),{mode:0o600});}}}));
 for(const media of data.media||[]){const originalThumb=media.thumbnailURL;for(const asset of [media,...Object.values(media.sizes||{})])if(asset?.url&&ledger[site+'|'+asset.url])asset.url=ledger[site+'|'+asset.url];if(originalThumb&&ledger[site+'|'+originalThumb])media.thumbnailURL=ledger[site+'|'+originalThumb];media.prefix=prefix;media._objectKey=null;}
 data.mediaCopiedTo=prefix;fs.writeFileSync(file,JSON.stringify(data,null,2),{mode:0o600});console.log(`${site}: copied ${jobs.length} original/derivative objects into owned prefix.`);
}
