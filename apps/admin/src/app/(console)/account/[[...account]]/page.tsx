import {UserProfile} from '@clerk/nextjs';
import {auth} from '@clerk/nextjs/server';
import {notFound} from 'next/navigation';
import {clerkConsoleEnabled} from '@/lib/console-identity';
export default async function Account(){
 if(!clerkConsoleEnabled())notFound();
 await auth.protect();
 return <main id="main" className="auth-panel"><UserProfile routing="path" path="/account" /></main>;
}
