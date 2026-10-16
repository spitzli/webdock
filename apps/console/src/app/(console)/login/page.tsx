import {redirect} from "next/navigation";
export const dynamic="force-dynamic";
export default function Login(){redirect("/api/sso/login");}
