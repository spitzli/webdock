import type { Metadata } from 'next';
import localFont from 'next/font/local';
import '@webdock/cms-ui/styles.css';
const space=localFont({src:'../../../public/fonts/space-grotesk.ttf',variable:'--font-space',display:'swap'});
export const metadata:Metadata={title:'CMS — Webdock',robots:{index:false,follow:false},referrer:'same-origin'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" className={space.variable}><body>{children}</body></html>;}
