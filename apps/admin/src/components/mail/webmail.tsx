"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@webdock/i18n/react";
import { launchWebmail } from "@/lib/webmail-actions";
import { MessageHTML } from "./message-html";

type Folder = { id: string; name: string; role?: string; unreadEmails: number };
type Address = { email: string; name?: string };
type Attachment = { blobId:string; name:string; type:string; size:number };
type Email = { id: string; subject: string; from?: Address[]; replyTo?: Address[]; to?: Address[]; receivedAt?: string; preview?: string; keywords?: Record<string, boolean>; messageId?: string[]; references?: string[]; textBody?: { partId: string }[]; htmlBody?: { partId:string; type:string }[]; bodyValues?: Record<string, { value: string; isTruncated?: boolean }>; hasAttachment?: boolean; attachments?:Attachment[] };
type Connection = { base: string; expiresAt: number };
class MailError extends Error { constructor(message: string, readonly uncertain = false, readonly revoked = false) { super(message); } }
async function request<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { method: "POST", credentials: "include", redirect: "error", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) }); }
  catch { throw new MailError("Mail connection interrupted. Check the mailbox before repeating a change.", true); }
  const data = await response.json();
  if (!response.ok) throw new MailError(typeof data.error === "string" ? data.error : "Mail request failed.", data.uncertain === true, [401,403].includes(response.status));
  return data as T;
}
const addresses = (values?: Address[]) => (values ?? []).map(value=>value.name ? `${value.name} <${value.email}>` : value.email).join(", ");
const bodyText = (message: Email) => (message.textBody ?? []).map(part=>message.bodyValues?.[part.partId]?.value ?? "").join("\n\n");

export function Webmail({ customerID, mailboxID, address }: { customerID: string; mailboxID: string; address: string }) {
  const i18n = useI18n();
  const [connection,setConnection] = useState<Connection>();
  const [folders,setFolders] = useState<Folder[]>([]), [folder,setFolder] = useState("");
  const [emails,setEmails] = useState<Email[]>([]), [message,setMessage] = useState<Email>();
  const [search,setSearch] = useState(""), [query,setQuery] = useState(""), [position,setPosition] = useState(0), [total,setTotal] = useState(0);
  const [refresh,setRefresh] = useState(0), [error,setError] = useState(""), [notice,setNotice] = useState(""), [busy,setBusy] = useState(false);
  const [identity,setIdentity] = useState("");
  const [compose,setCompose] = useState<{ to: string; subject: string; text: string; inReplyTo?: string[]; references?: string[] }>();
  const [uncertain,setUncertain] = useState(false);
  const [attachments,setAttachments] = useState<Attachment[]>([]);
  const selection = useRef(0);
  const report = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "Mail request failed.");
    if (cause instanceof MailError && cause.revoked) { setConnection(undefined); setEmails([]); setMessage(undefined); setCompose(undefined); }
  }, []);
  useEffect(() => {
    let active = true, current: Connection | undefined;
    void (async()=>{
      const launch = await launchWebmail(customerID,mailboxID);
      if (!active) return;
      if (!launch.launch) throw new MailError(launch.error || "Mail access is unavailable.");
      const session = await request<{scopeID:string;customerID:string;mailboxID:string;expiresAt:string}>(launch.launch.gatewayOrigin+"/session",{code:launch.launch.code});
      if (!/^[1-9][0-9]{0,18}$/.test(session.scopeID) || session.customerID!==customerID || session.mailboxID!==mailboxID) throw new MailError("Invalid Mail session.");
      current={base:`${launch.launch.gatewayOrigin}/s/${session.scopeID}`,expiresAt:Date.parse(session.expiresAt)};
      if (!active) { void request(current.base+"/logout",{}).catch(()=>{}); return; }
      const [folderData,senderData] = await Promise.all([request<{data:{list:Folder[]}}>(current.base+"/mail",{action:"folders"}),request<{data:{id:string}[]}>(current.base+"/mail",{action:"identities"})]);
      if (!active) return;
      setFolders(folderData.data.list); setFolder(folderData.data.list.find(item=>item.role==="inbox")?.id ?? folderData.data.list[0]?.id ?? "");
      setIdentity(senderData.data[0]?.id ?? ""); setConnection(current);
    })().catch(cause=>{if(active)report(cause);});
    return ()=>{active=false;if(current)void request(current.base+"/logout",{}).catch(()=>{});};
  },[customerID,mailboxID,report]);
  useEffect(()=>{
    if(!connection)return;
    const timeout=setTimeout(()=>report(new MailError("Mail session expired. Reload to reconnect.",false,true)),Math.max(0,connection.expiresAt-Date.now()));
    return ()=>clearTimeout(timeout);
  },[connection,report]);
  useEffect(()=>{
    if(!connection || !folder)return;
    let active=true;
    void request<{data:{list:Email[];total:number}}>(connection.base+"/mail",{action:"list",mailboxId:folder,...(query?{text:query}:{}),position,limit:30})
      .then(result=>{if(active){setEmails(result.data.list);setTotal(result.data.total);}}).catch(cause=>{if(active)report(cause);});
    return ()=>{active=false;};
  },[connection,folder,query,position,refresh,report]);
  useEffect(()=>{
    if(!compose)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[compose]);
  const call = async <T,>(body: unknown) => { if(!connection)throw new MailError("Mail session required.");return (await request<{data:T}>(connection.base+"/mail",body)).data; };
  const open = async (id: string) => {
    const version=++selection.current;setError("");
    try {const selected=await call<Email>({action:"read",emailId:id});if(version!==selection.current)return;setMessage(selected);
      if(!selected.keywords?.$seen){await call({action:"update",emailId:id,requestID:crypto.randomUUID(),change:{seen:true}});setRefresh(value=>value+1);}
    }catch(cause){if(version===selection.current)report(cause);}
  };
  const send = async (event: FormEvent) => {
    event.preventDefault();if(!compose || busy || uncertain)return;setBusy(true);setError("");setNotice("");
    try {
      const draft=await call<{id:string}>({action:"draft",requestID:crypto.randomUUID(),draft:{identityId:identity,to:compose.to.split(/[,;]/).map(value=>({email:value.trim()})).filter(value=>value.email),subject:compose.subject,text:compose.text,attachments,...(compose.inReplyTo?{inReplyTo:compose.inReplyTo}:{}),...(compose.references?{references:compose.references}:{})}});
      const sent=await call<{filed:boolean}>({action:"submit",requestID:crypto.randomUUID(),emailId:draft.id,identityId:identity});
      setCompose(undefined);setAttachments([]);setNotice(sent.filed?"Message accepted for delivery.":"Message accepted for delivery. Filing in Sent needs review.");setRefresh(value=>value+1);
    }catch(cause){if(cause instanceof MailError && cause.uncertain)setUncertain(true);report(cause);}finally{setBusy(false);}
  };
  const move = async (role:string) => {
    const destination=folders.find(item=>item.role===role);if(!message || !destination || busy)return;
    setBusy(true);try{await call({action:"update",emailId:message.id,requestID:crypto.randomUUID(),change:{mailboxIds:[destination.id]}});setMessage(undefined);selection.current++;setRefresh(value=>value+1);}catch(cause){report(cause);}finally{setBusy(false);}
  };
  const upload = async (files:FileList|null) => {
    if(!files || !connection)return;
    const selected=[...files];
    if(selected.length+attachments.length>10 || selected.reduce((sum,file)=>sum+file.size,0)+attachments.reduce((sum,file)=>sum+file.size,0)>10*1024*1024){setError("Choose up to 10 attachments, totaling at most 10 MiB.");return;}
    setBusy(true);setError("");
    try{for(const file of selected){const response=await fetch(connection.base+"/upload",{method:"POST",credentials:"include",redirect:"error",headers:{"Content-Type":file.type||"application/octet-stream","X-Webdock-Filename":encodeURIComponent(file.name)},body:file,signal:AbortSignal.timeout(30_000)});if(!response.ok)throw new MailError("Attachment upload failed.",false,[401,403].includes(response.status));const result=await response.json();setAttachments(current=>[...current,result.data]);}}
    catch(cause){report(cause);}finally{setBusy(false);}
  };
  const download = async (attachment:Attachment) => {
    if(!connection || !message)return;
    try{const response=await fetch(connection.base+"/download",{method:"POST",credentials:"include",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify({emailId:message.id,blobId:attachment.blobId}),signal:AbortSignal.timeout(30_000)});if(!response.ok)throw new MailError("Attachment download failed.",false,[401,403].includes(response.status));const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;link.download=attachment.name||"attachment";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(cause){report(cause);}
  };
  return <section className="webmail" aria-label={i18n.t("Webmail")}>
    {error && <p className="notice error webmail-notice" role="alert">{i18n.error(error)}</p>}{notice && <p className="notice webmail-notice" role="status">{i18n.t(notice)}</p>}
    {!connection && !error && <p role="status">{i18n.t("Connecting to mailbox…")}</p>}
    <aside className="webmail-folders"><button disabled={!connection || !identity || !!compose} onClick={()=>{setUncertain(false);setAttachments([]);setCompose({to:"",subject:"",text:""});}}>{i18n.t("New message")}</button>
      <nav aria-label={i18n.t("Mail folders")}>{folders.map(item=><button key={item.id} aria-current={folder===item.id?"page":undefined} onClick={()=>{setFolder(item.id);setPosition(0);setMessage(undefined);selection.current++;}}>{item.role?i18n.t(({inbox:"Inbox",drafts:"Drafts",sent:"Sent",trash:"Trash",junk:"Junk",archive:"Archive"} as Record<string,string>)[item.role]??item.name):item.name}<span>{item.unreadEmails || ""}</span></button>)}</nav>
    </aside>
    <div className="webmail-messages"><form className="webmail-search" onSubmit={event=>{event.preventDefault();setQuery(search);setPosition(0);}}><label><span className="sr-only">{i18n.t("Search messages")}</span><input type="search" maxLength={500} value={search} onChange={event=>setSearch(event.target.value)} placeholder={i18n.t("Search messages")} /></label><button disabled={!connection}>{i18n.t("Search")}</button></form>
      <div className="webmail-message-list">{emails.map(item=><button key={item.id} className={item.keywords?.$seen?"":"unread"} aria-pressed={message?.id===item.id} onClick={()=>void open(item.id)}><span className="webmail-sender">{addresses(item.from)}</span><strong>{item.subject || i18n.t("No subject")}</strong><span className="muted">{item.preview}</span>{item.hasAttachment && <span>{i18n.t("Attachments")}</span>}</button>)}{connection && !emails.length && <p className="muted">{i18n.t("No messages in this view.")}</p>}</div>
      <footer className="webmail-pagination"><button disabled={position===0} onClick={()=>setPosition(value=>Math.max(0,value-30))}>{i18n.t("Previous")}</button><span>{emails.length?position+1:0}–{position+emails.length} / {total}</span><button disabled={position+30>=total} onClick={()=>setPosition(value=>value+30)}>{i18n.t("Next")}</button></footer>
    </div>
    <article className="webmail-reader">{compose?<form onSubmit={send} className="webmail-compose"><h2>{i18n.t("New message")}</h2><p>{address}</p><fieldset disabled={busy || uncertain}><label>{i18n.t("To")}<input type="text" value={compose.to} required onChange={event=>setCompose({...compose,to:event.target.value})} /></label><label>{i18n.t("Subject")}<input maxLength={998} value={compose.subject} onChange={event=>setCompose({...compose,subject:event.target.value})} /></label><label>{i18n.t("Message")}<textarea rows={16} value={compose.text} maxLength={262144} onChange={event=>setCompose({...compose,text:event.target.value})} /></label><label>{i18n.t("Attachments (up to 10 MiB)")}<input type="file" multiple onChange={event=>{void upload(event.target.files);event.target.value="";}} /></label>{attachments.map((item,index)=><p key={item.blobId+index}>{item.name} <button type="button" onClick={()=>setAttachments(current=>current.filter((_,position)=>position!==index))}>{i18n.t("Remove attachment")}</button></p>)}<button type="submit">{busy?i18n.t("Sending…"):i18n.t("Send message")}</button></fieldset><button type="button" disabled={busy} onClick={()=>{if(window.confirm(i18n.t("Discard this unsaved message?")))setCompose(undefined);}}>{i18n.t("Close draft")}</button>{uncertain && <p role="alert">{i18n.t("The result is unknown. Check Drafts and Sent before composing this message again.")}</p>}</form>:message?<>
      <div className="webmail-toolbar"><button disabled={!identity} onClick={()=>{setUncertain(false);setAttachments([]);setCompose({to:(message.replyTo??message.from??[]).map(item=>item.email).join(", "),subject:/^re:/i.test(message.subject)?message.subject:`Re: ${message.subject}`,text:"\n\n"+bodyText(message).split("\n").map(line=>"> "+line).join("\n"),inReplyTo:message.messageId,references:[...(message.references??[]),...(message.messageId??[])].slice(-50)});}}>{i18n.t("Reply")}</button><button disabled={busy || !folders.some(item=>item.role==="archive")} onClick={()=>void move("archive")}>{i18n.t("Archive")}</button><button disabled={busy || !folders.some(item=>item.role==="trash")} onClick={()=>void move("trash")}>{i18n.t("Move to trash")}</button></div>
      <h2>{message.subject || i18n.t("No subject")}</h2><p>{addresses(message.from)}<br /><span className="muted">{addresses(message.to)}</span></p>{message.htmlBody?.some(part=>part.type==="text/html")?<MessageHTML html={message.htmlBody.filter(part=>part.type==="text/html").map(part=>message.bodyValues?.[part.partId]?.value??"").join("<br>")} />:<pre className="webmail-body">{bodyText(message) || i18n.t("This message has no plain-text body.")}</pre>}
      {Object.values(message.bodyValues??{}).some(part=>part.isTruncated) && <p role="status">{i18n.t("This message is truncated.")}</p>}
      {!!message.attachments?.length && <section aria-label={i18n.t("Attachments")}><h3>{i18n.t("Attachments")}</h3>{message.attachments.map((item,index)=><p key={item.blobId+index}><button onClick={()=>void download(item)}>{item.name || i18n.t("Attachment")}</button> <span className="muted">{Math.ceil(item.size/1024)} KiB</span></p>)}</section>}
    </>:<p className="webmail-empty muted">{i18n.t("Select a message to read it.")}</p>}</article>
  </section>;
}
