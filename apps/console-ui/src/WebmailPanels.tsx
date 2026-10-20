import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import DOMPurify from "dompurify";
import { displayAddresses, messageBody, type MailEmail, type MailFolder, type MailSubmission } from "./webmail-contracts";
import type { WebmailConnection, WriteCommand } from "./webmail-client";
import type { MailEditor } from "./webmail-editor";
import { Loading } from "./common";

export function MailMessageList({ value, selected, select, position, page }: {
  value: { list: MailEmail[]; total: number }; selected: string; select: (id: string) => void; position: number; page: (position: number) => void;
}) {
  return <>
    <div className="mail-message-list" aria-label="Messages">
      {value.list.length ? value.list.map((email) => <button className={`mail-message-row ${selected === email.id ? "selected" : ""}`} key={email.id} aria-pressed={selected === email.id} onClick={() => { select(email.id); }}>
        <span className="mail-message-sender">{displayAddresses(email.from) || "Unknown sender"}</span>
        <strong>{email.subject || "(No subject)"}</strong><span className="muted mail-message-preview">{email.preview}</span>
      </button>) : <p className="mail-empty muted">No messages in this view.</p>}
    </div>
    <div className="mail-pagination"><button className="button" disabled={position === 0} onClick={() => { page(Math.max(0, position - 50)); }}>Previous</button><span className="muted">{value.total ? `${String(position + 1)}–${String(Math.min(position + 50, value.total))} of ${String(value.total)}` : "0 messages"}</span><button className="button" disabled={position + 50 >= value.total} onClick={() => { page(position + 50); }}>Next</button></div>
  </>;
}
export function MailMessage({ message, selected, connection, folders, blocked, reply, update, report }: {
  message: MailEmail | null; selected: string; connection: WebmailConnection; folders: MailFolder[]; blocked: boolean;
  reply: ((message: MailEmail) => void) | undefined;
  update: (emailId: string, change: Extract<WriteCommand, { action: "update" }>["change"]) => void;
  report: (error: unknown) => void;
}) {
  if (!selected) return <p className="mail-empty muted">Select a message to read it.</p>;
  if (!message) return <Loading>Loading message…</Loading>;
  const plain = messageBody(message, "textBody");
  const html = messageBody(message, "htmlBody");
  const download = async (blobId: string, name: string) => {
    try {
      const blob = await connection.download(message.id, blobId);
      if (connection.isClosed()) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = name; anchor.rel = "noopener";
      anchor.click();
      setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
    } catch (cause) { report(cause); }
  };
  return <article className="mail-message" aria-label="Message content">
    <header><h2>{message.subject || "(No subject)"}</h2><p>{displayAddresses(message.from)}</p><p className="muted">To: {displayAddresses(message.to)}</p>{message.receivedAt ? <p className="muted">{message.receivedAt}</p> : null}</header>
    <div className="mail-message-actions">
      <button className="button" disabled={blocked || !reply} onClick={() => { reply?.(message); }}>Reply</button>
      <button className="button" disabled={blocked} onClick={() => { update(message.id, { seen: !message.keywords.$seen }); }}>{message.keywords.$seen ? "Mark unread" : "Mark read"}</button>
      <button className="button" disabled={blocked} onClick={() => { update(message.id, { flagged: !message.keywords.$flagged }); }}>{message.keywords.$flagged ? "Unstar" : "Star"}</button>
      <label className="mail-move">Move to<select aria-label="Move message to folder" disabled={blocked} value="" onChange={(event) => { if (folders.some((folder) => folder.id === event.target.value)) update(message.id, { mailboxIds: [event.target.value] }); }}><option value="">Choose folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
    </div>
    {plain ? <div className="mail-message-body">{plain}</div> : html ? <MessageHTML html={html} /> : <p className="mail-empty muted">This message has no readable body.</p>}
    {Object.values(message.bodyValues).some((part) => part.isTruncated) ? <p className="notice">This message body is truncated.</p> : null}
    {message.attachments.length ? <section className="mail-attachments"><h3>Attachments</h3>{message.attachments.map((attachment) => <button key={attachment.blobId} className="button" onClick={() => void download(attachment.blobId, attachment.name)}>{attachment.name} · {Math.ceil(attachment.size / 1024)} KiB</button>)}</section> : null}
  </article>;
}
export function MessageHTML({ html }: { html: string }) {
  // Adapted from the owned Mail viewer. No remote images, links, scripts, forms or document styles.
  const document = useMemo(() => {
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ["p","br","div","span","strong","b","em","i","u","s","blockquote","pre","code","hr","h1","h2","h3","h4","ul","ol","li","table","thead","tbody","tfoot","tr","td","th","caption"],
      ALLOWED_ATTR: ["colspan","rowspan","dir","lang"], ALLOW_DATA_ATTR: false,
    });
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{font:15px/1.65 Arial,sans-serif;color:#202428;overflow-wrap:anywhere;margin:12px}table{max-width:100%;border-collapse:collapse}td,th{padding:6px}pre{white-space:pre-wrap}blockquote{border-left:2px solid #dfe3e6;padding-left:16px}</style></head><body>${clean}</body></html>`;
  }, [html]);
  return <div><p className="muted">External images and active content are blocked.</p><iframe className="mail-html" title="Sanitized message content" sandbox="" referrerPolicy="no-referrer" srcDoc={document} /></div>;
}
export function MailComposer({ value, change, save, send, close, upload, blocked, saved, sendingAvailable }: {
  value: MailEditor; change: Dispatch<SetStateAction<MailEditor | null>>; save: () => void; send: () => void; close: () => void; upload: (files: FileList | null) => void; blocked: boolean; saved: boolean; sendingAvailable: boolean;
}) {
  const field = (name: "to" | "cc" | "bcc" | "subject" | "text", value: string) => { change((current) => current ? { ...current, [name]: value } : null); };
  return <form className="mail-compose" aria-label="Compose message" onSubmit={(event) => { event.preventDefault(); save(); }}>
    <div className="flex items-center justify-between gap-3"><h2>Compose message</h2><button className="button quiet" type="button" disabled={blocked} onClick={close}>Close composer</button></div>
    <fieldset disabled={blocked}>
      {(["to", "cc", "bcc"] as const).map((name) => <label key={name}>{name === "to" ? "To" : name.toUpperCase()}<input value={value[name]} maxLength={32000} onChange={(event) => { field(name, event.target.value); }} /></label>)}
      <label>Subject<input value={value.subject} maxLength={998} onChange={(event) => { field("subject", event.target.value); }} /></label>
      <label>Message<textarea value={value.text} rows={13} onChange={(event) => { field("text", event.target.value); }} /></label>
      <label>Attach files<input type="file" multiple onChange={(event) => { upload(event.target.files); event.target.value = ""; }} /></label>
      {value.attachments.map((attachment) => <div className="flex items-center justify-between gap-2" key={attachment.blobId}><span>{attachment.name}</span><button className="button quiet" type="button" onClick={() => { change((current) => current ? { ...current, attachments: current.attachments.filter((item) => item.blobId !== attachment.blobId) } : null); }}>Remove attachment</button></div>)}
      <div className="flex flex-wrap gap-2"><button className="button" type="submit">Save draft</button><button className="button primary" type="button" disabled={!saved || !sendingAvailable} onClick={send}>Send message</button></div>
    </fieldset>
    <p className="muted">{saved ? (sendingAvailable ? "Draft saved. Sending uses the recorded native queue." : "Draft saved.") : "Save this draft before sending. Unsaved changes stay only in this tab."}</p>
    {!sendingAvailable ? <p className="notice">Sending is not enabled for this workspace. You can save a draft.</p> : null}
  </form>;
}
export function SubmissionNotice({ value, blocked, change }: {
  value: MailSubmission; blocked: boolean; change: (operation: "status" | "cancel" | "file") => void;
}) {
  const text = {
    staging: "Message is being staged.", queued: "Message is queued.", leased: "Delivery is being prepared.", handoff: "Delivery handoff is in progress.",
    accepted: "Message was accepted for delivery.", rejected: "Message was rejected. The draft is retained.", cancelled: "Sending was cancelled. The draft is retained.",
    unknown: "Delivery outcome is unknown. Do not resend this message.", preparation_review: "Sending needs review. The draft is retained.",
  };
  return <section className="notice" role="status"><p>{text[value.state]}</p>
    {value.state === "accepted" ? <p>{value.filed ? "A Sent copy is recorded." : "The Sent copy is not yet confirmed."}</p> : null}
    <div className="flex flex-wrap gap-2"><button className="button" onClick={() => { change("status"); }}>Check sending status</button>
      {["staging", "queued", "leased", "preparation_review"].includes(value.state) ? <button className="button" disabled={blocked} onClick={() => { change("cancel"); }}>Cancel sending</button> : null}
      {value.state === "accepted" && !value.filed ? <button className="button" disabled={blocked} onClick={() => { change("file"); }}>Retry Sent filing</button> : null}
    </div>
  </section>;
}
