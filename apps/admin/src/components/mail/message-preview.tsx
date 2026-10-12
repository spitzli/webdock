'use client';
import dynamic from 'next/dynamic';
// DOMPurify needs a browser DOM. The text version remains server-rendered beside this preview.
const Preview=dynamic(()=>import('./message-html').then(module=>module.MessageHTML),{ssr:false});
export function MessagePreview({html}:{html:string}){return <Preview html={html}/>;}
