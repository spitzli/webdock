import Mail from "../mail-workspace";
export default function Page(props: {params:Promise<{customerID:string}>;searchParams:Promise<{mailPage?:string;mailSearch?:string}>}) {return <Mail {...props} view="settings"/>;}
