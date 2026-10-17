import {studioCall} from '@/lib/studio-client';
import {PluginFrame} from './frame';
import Link from 'next/link';
type Plugin={manifest:{name:string;description?:string;version:string;navigation:Array<{path:string;label:string}>;actions:Array<{name:string;intent:'read'|'write';destructive?:boolean}>};uiOrigin?:string};
export default async function ProjectPlugins({params}:{params:Promise<{projectID:string}>}){
 const {projectID}=await params;
 const plugins=await studioCall<Plugin[]>('plugins.list',[projectID]);
 return <main><Link href={`/hosting/projects/${projectID}/overview`}>Back to project</Link><h1>Project extensions</h1>{plugins.length===0?<p>No extensions are enabled for this project.</p>:plugins.map(p=><section className="panel" key={p.manifest.name}><h2>{p.manifest.navigation[0]?.label??p.manifest.name}</h2><p>{p.manifest.description}</p>{p.uiOrigin&&p.manifest.navigation[0]?<PluginFrame pluginID={p.manifest.name} projectID={projectID} url={p.uiOrigin+p.manifest.navigation[0].path} actions={p.manifest.actions} label={p.manifest.navigation[0].label}/>:<p>This extension has no configured panel.</p>}</section>)}</main>;
}
