import type { MailDirectory } from "./mail-contracts";
import { Link } from "@tanstack/react-router";
import { useApi, useSession } from "./context";
export function MailDirectoryView({ value }: { value: MailDirectory }) {
  const api = useApi();
  const session = useSession();
  const webmail = Boolean(api.config.mailGatewayOrigin) && !session.user.preview;
  const configuration = value.configuration;
  return (
    <>
      <section className="security-section">
        <h2>Mailbox configuration</h2>
        {configuration ? (
          <>
            <p>
              Requested revision {configuration.revision} · Applied revision{" "}
              {configuration.appliedRevision}
            </p>
            <p className="muted">
              {configuration.state?.replaceAll("_", " ") ??
                "No operation recorded"}
            </p>
            {configuration.revision !== configuration.appliedRevision ? (
              <p role="status">
                These changes are not yet applied. Queued domains, mailboxes and
                grants do not provide working delivery or access.
              </p>
            ) : null}
          </>
        ) : (
          <p className="muted">No mailbox configuration recorded.</p>
        )}
        <p className="muted">
          {webmail ? "Mailbox content requires your current explicit access grant." : "Webmail is unavailable for this session or installation."}
        </p>
      </section>
      <section className="security-section">
        <h2>Mailboxes</h2>
        {value.mailboxes.length ? (
          <ul className="security-list">
            {value.mailboxes.map((mailbox) => (
              <li key={mailbox.id}>
                <div>
                  <strong>{mailbox.name}</strong>
                  <p>{mailbox.address}</p>
                  <p className="muted">
                    {mailbox.state.replaceAll("_", " ")} ·{" "}
                    {mailbox.enabled ? "Enabled" : "Disabled"} · Quota{" "}
                    {mailbox.quotaBytes} bytes
                  </p>
                  {webmail && mailbox.canOpen ? <Link className="button mt-2" to="/mail/inbox/$mailboxID" params={{ mailboxID: mailbox.id }} search={{ customer: value.customerID }}>Open mailbox</Link> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No mailboxes are visible to your account.</p>
        )}
      </section>
      <section className="security-section">
        <h2>Domains</h2>
        {value.domains.length ? (
          <ul className="security-list">
            {value.domains.map((domain) => (
              <li key={domain.id}>
                <strong>{domain.name}</strong>
                <span>{domain.state.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No incoming domains are attached.</p>
        )}
      </section>
      {value.canManage ? (
        <section className="security-section">
          <h2>Mailbox access</h2>
          {value.grants.length ? (
            <ul className="security-list">
              {value.grants.map((grant) => (
                <li key={`${grant.mailboxID}:${grant.subject}`}>
                  <div>
                    <strong>
                      {value.mailboxes.find(
                        (mailbox) => mailbox.id === grant.mailboxID,
                      )?.address ?? grant.mailboxID}
                    </strong>
                    <p>
                      {value.people.find(
                        (person) => person.id === grant.subject,
                      )?.name ?? grant.subject}
                    </p>
                    <p className="muted">
                      {grant.enabled ? "Requested access" : "Revoked"} ·
                      Revision {grant.revision}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              No mailbox grants recorded. Operator access does not grant mailbox
              content access.
            </p>
          )}
        </section>
      ) : null}
    </>
  );
}
