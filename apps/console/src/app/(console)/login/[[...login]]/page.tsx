import {SignIn} from '@clerk/nextjs';
import {redirect} from 'next/navigation';
import {clerkConsoleEnabled} from '@/lib/console-identity';
export const dynamic='force-dynamic';
export default function Login(){
 if(!clerkConsoleEnabled())redirect('/api/sso/login');
 return <main id="main" className="auth-panel"><SignIn routing="path" path="/login" signUpUrl="/sign-up" /></main>;
}
