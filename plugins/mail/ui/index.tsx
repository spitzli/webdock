// Console UI of the mail plugin. Bundled by the Console; every call goes through the plugin action API.
import { useState } from "react";
import { z } from "zod";
import { Failure, Loading, ui, usePluginMutation, usePluginQuery, type PluginUI, type ResourceProps } from "@webdock/plugin-ui";

const domainSchema = z.object({
  domain: z.string(),
  verified: z.boolean(),
  verificationSkipped: z.boolean(),
  transport: z.enum(["platform", "turbosmtp"]),
  records: z.array(z.object({ type: z.string(), name: z.string(), value: z.string(), purpose: z.string() })),
  recent: z.array(z.object({ from: z.string(), to: z.string(), subject: z.string(), transport: z.string(), status: z.enum(["accepted", "failed"]), at: z.string() })),
});
type Domain = z.infer<typeof domainSchema>;
const relaySchema = z.object({ provider: z.string(), region: z.string(), keyHint: z.string(), connectedAt: z.string() });
const verifySchema = z.object({ verified: z.boolean() });

function Copy({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={ui.cx(ui.button("quiet"), "relative z-10")}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => { setCopied(false); }, 1500);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Remove({ context, action, noun, feature }: { context: ResourceProps; action: string; noun: string; feature: string }) {
  const remove = usePluginMutation(context, action, { leaves: true });
  const [confirming, setConfirming] = useState(false);
  if (!context.writable || !context.features.includes(feature)) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline pt-4 first:border-t-0 first:pt-0">
      <div>
        <p className="text-sm font-medium">Remove {noun}</p>
        <p className="text-[13px] text-muted">{noun === "domain" ? "Mail can no longer be sent from this domain." : "Mail goes through the platform again."}</p>
      </div>
      {confirming ? (
        <div className="flex gap-2">
          <button type="button" className={ui.button("danger")} disabled={remove.isPending} onClick={() => { remove.mutate({ resource_id: context.resource.id }, { onSuccess: context.onDeleted }); }}>
            {remove.isPending ? "Removing…" : `Remove ${noun}`}
          </button>
          <button type="button" className={ui.button("quiet")} onClick={() => { setConfirming(false); }}>Cancel</button>
        </div>
      ) : (
        <button type="button" className={ui.button("danger")} onClick={() => { setConfirming(true); }}>Remove</button>
      )}
      {remove.error ? <p role="alert" className="basis-full text-sm text-danger">{remove.error.message}</p> : null}
    </div>
  );
}

function SendForm({ context, domain }: { context: ResourceProps; domain: Domain }) {
  const send = usePluginMutation(context, "mail.send");
  const [sent, setSent] = useState<string>();
  return (
    <form
      className={ui.cx(ui.card, ui.cardBody)}
      aria-label="Send a message"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
        setSent(undefined);
        send.mutate({ resource_id: context.resource.id, ...data }, {
          onSuccess: () => { setSent(data.to); form.reset(); },
        });
      }}
    >
      <h2 className={ui.sectionTitle}>Send a message</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={ui.field}>
          From
          <span className="flex items-center gap-2">
            <input className={ui.input} name="from" required maxLength={64} defaultValue="hello" />
            <span className="shrink-0 text-sm text-muted">@{domain.domain}</span>
          </span>
        </label>
        <label className={ui.field}>
          Sender name
          <input className={ui.input} name="from_name" maxLength={80} />
        </label>
      </div>
      <label className={ui.field}>
        To
        <input className={ui.input} name="to" required maxLength={2000} placeholder="someone@example.com, another@example.com" />
        <span className={ui.hint}>Up to 10 addresses, separated by commas.</span>
      </label>
      <label className={ui.field}>
        Subject
        <input className={ui.input} name="subject" required maxLength={200} />
      </label>
      <label className={ui.field}>
        Message
        <textarea className={ui.cx(ui.input, "min-h-32")} name="text" required maxLength={30000} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className={ui.button("primary")} disabled={send.isPending || !domain.verified}>{send.isPending ? "Sending…" : "Send"}</button>
        {!domain.verified ? <span className="text-[13px] text-muted">Verify the domain first.</span> : null}
        {sent ? <span role="status" className="text-[13px] text-success">Sent to {sent}.</span> : null}
        {send.error ? <span role="alert" className="text-sm text-danger">{send.error.message}</span> : null}
      </div>
    </form>
  );
}

function DomainPage(context: ResourceProps) {
  const query = usePluginQuery(context, "domains.view", { resource_id: context.resource.id }, domainSchema);
  const verify = usePluginMutation(context, "domains.verify");
  if (query.isPending) return <Loading>Loading domain…</Loading>;
  if (query.error) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const domain = query.data;
  const checked = verify.data ? verifySchema.safeParse(verify.data) : undefined;
  return (
    <div className="grid gap-6">
      <section className={ui.card} aria-label="Status">
        <div className={ui.cardBody}>
          <div className="flex flex-wrap items-center gap-3">
            <span className={ui.badge(domain.verified ? "success" : "warning")}>{domain.verified ? "Verified" : "Not verified"}</span>
            <span className="text-sm text-muted">
              {domain.transport === "turbosmtp" ? "Sends through your own turboSMTP account" : "Sends through the platform"}
            </span>
          </div>
          {domain.verificationSkipped ? <p className={ui.notice}>Local development: DNS ownership is not checked here.</p> : null}
          {!domain.verified ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">Add the ownership record below at your DNS provider, then check it.</p>
              {context.writable ? (
                <button type="button" className={ui.button()} disabled={verify.isPending} onClick={() => { verify.mutate({ resource_id: context.resource.id }); }}>
                  {verify.isPending ? "Checking…" : "Check DNS"}
                </button>
              ) : null}
              {checked?.success && !checked.data.verified ? <p role="alert" className="text-sm text-danger">The record was not found yet. DNS changes can take a while.</p> : null}
            </div>
          ) : null}
        </div>
      </section>
      <section className={ui.card} aria-label="DNS records">
        <h2 className={ui.cx(ui.sectionTitle, "px-6 py-4 max-sm:px-[18px]")}>DNS records</h2>
        {domain.records.map((record) => (
          <div key={record.name + record.value} className={ui.cardRow}>
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="text-[13px] text-muted">{record.purpose}</span>
              <span className="text-sm"><span className="font-medium">{record.type}</span> <code className={ui.mono}>{record.name}</code></span>
              <code className={ui.cx(ui.mono, "break-all")}>{record.value}</code>
            </div>
            <Copy value={record.value} />
          </div>
        ))}
      </section>
      {context.writable ? <SendForm context={context} domain={domain} /> : null}
      <section className={ui.card} aria-label="Recent messages">
        <h2 className={ui.cx(ui.sectionTitle, "px-6 py-4 max-sm:px-[18px]")}>Recent messages</h2>
        {domain.recent.length === 0 ? <p className="px-6 pb-5 text-sm text-muted max-sm:px-[18px]">Nothing sent yet.</p> : domain.recent.map((message) => (
          <div key={message.at + message.to} className={ui.cardRow}>
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate font-medium">{message.subject}</span>
              <span className="truncate text-[13px] text-muted">{message.from} to {message.to}</span>
            </div>
            <span className={ui.badge(message.status === "accepted" ? "success" : "danger")}>{message.status === "accepted" ? "Sent" : "Failed"}</span>
          </div>
        ))}
      </section>
      <div className={ui.cx(ui.card, ui.cardBody)}>
        <Remove context={context} action="domains.delete" noun="domain" feature="add-domains" />
      </div>
    </div>
  );
}

function RelayPage(context: ResourceProps) {
  const query = usePluginQuery(context, "relay.view", { resource_id: context.resource.id }, relaySchema);
  if (query.isPending) return <Loading>Loading account…</Loading>;
  if (query.error) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const relay = query.data;
  return (
    <section className={ui.card} aria-label="Account">
      <div className={ui.cardBody}>
        <p className="text-sm">All mail of this project goes through this {relay.provider} account ({relay.region} region).</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">Consumer key</dt>
          <dd><code className={ui.mono}>{relay.keyHint}</code></dd>
          <dt className="text-muted">Secret</dt>
          <dd className="text-muted">Stored encrypted, never shown again</dd>
          <dt className="text-muted">Connected</dt>
          <dd>{relay.connectedAt.slice(0, 16)}</dd>
        </dl>
        <Remove context={context} action="relay.delete" noun="account" feature="byok-turbosmtp" />
      </div>
    </section>
  );
}

function Resource(context: ResourceProps) {
  return context.resource.offering === "relay" ? <RelayPage {...context} /> : <DomainPage {...context} />;
}

export default { Resource } satisfies PluginUI;
