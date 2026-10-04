# Root administration and tenant Mail

User requested implementation of tenant Mail/turboSMTP plus central configurable Webdock root administration and confirmed the root/superadmin interpretation.

- Central `/admin` is platform-operator-only. Studio and the operator account link to it; tenant admins cannot access it.
- Persist platform name/support contact, CMS customer-access toggle, Mail toggle, assigned sending IPv4, default quota and sending region. Brand/support affect account pages and auth email sender/reply-to. Signup stays invite-only.
- Encrypt master Consumer credentials with purpose separation. Client responses contain only connection status/key suffix. Configuration and credential changes are audited. Connection test reads only.
- Documented V2 subaccounts: create/link, quota/status, refresh. Each provider account maps uniquely to a tenant. Reserve before creation; uncertain outcomes require reconciliation rather than retrying creation. Require current operator and explicit provider terms acceptance. No real customer provisioning during tests.
- Mail members read; tenant admins manage local domains/ownership; platform operators provision and control quotas/status. Recheck membership, archive and account security state on every action.
- Sender-domain API: the public OpenAPI is incomplete; reuse the user-supplied RelayKit implementation at the public management host. Scoped child-token live checks validate sender create/list/delete and custom tracking create/detail/disable/delete. Keep public TXT ownership proof separate from provider SPF/DKIM verification. Add customer SMTP/API key lifecycle and custom tracking entirely inside Webdock.
- Validate root authorization, encryption, settings, CMS toggle, two-tenant isolation, provider requests, uncertain outcomes, DNS proof, mobile UI and deployments. Supplied Spitzli Development Consumer credentials are stored encrypted. Live scoped API resource checks passed and temporary resources were removed. Individual customers still need explicit Mail subaccount provisioning/linking.

Sources checked 2026-10-04:
https://serversmtp.com/turbo-api/
https://serversmtp.com/turbo-api/turbo-smtp.yaml
https://dashboard.serversmtp.com/chunk-QCRMX6XS.js
https://dashboard.serversmtp.com/chunk-NSAZUOXZ.js
https://dashboard.serversmtp.com/chunk-ESE62G2P.js
https://turbosmtp.com/terms-and-conditions/
