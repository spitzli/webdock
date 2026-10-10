# Webdock Mail integration lab

This is the first implementation increment, not a production Mail deployment. The selected architecture is [one CE instance per email-enabled customer](../../docs/architecture/mail-deployment-decision.md). Tenant activation and the managed-agent foundation are implemented separately. Production ingress, provider routing and Webmail remain in progress; the fixture does not enable any real customer.

## Run

Requires Node 24+, a local Linux Docker engine, Docker Compose and installed workspace dependencies:

```sh
npm ci
npm test -w @webdock/mail
npm run check -w @webdock/mail
npm run test:integration -w @webdock/mail
```

The integration command creates a randomly named `webdock-mail-test-*` Compose project, runs the real server tests and removes that project's containers, networks and volumes even when a test fails. Images stay cached. No existing mail service, credential, DNS record or Turbo callback is used. Do not run the test file directly against a persistent deployment.

`compose.test.yml` contains two independent Stalwart installations with separate configuration/data volumes and separate **internal** Docker networks. No ports are published and the instances have no internet egress. The host-side test runner reaches the Linux bridge addresses. Remote Docker engines and Docker Desktop are not supported by this runner.

## Pinned version

- Stalwart `v0.16.25`.
- Image digest `sha256:74e5a7d55303ba525d939c6bf97ed4e010df7521f52d80afc22a815b66bd53f3`.
- Image revision reported by Docker: `3f657330c0f49a015a3a372fb59669b5cccbca6d`.
- Each fixture is limited to 1 CPU and 1 GiB memory. These are lab limits, not a production sizing result.

The credentials in this file/test are deliberately public, disposable fixture credentials. Recovery administration over HTTP and self-signed SMTP TLS are confined to the egress-blocked lab. Production requires verified HTTPS/TLS, generated secret-manager credentials, removal of recovery access, and a separately reviewed network policy. Do not reuse this Compose file as the production template.

## What it checks

- Noninteractive bootstrap through the actual JMAP API and a server restart.
- Explicit `community` edition reported by `/api/account`.
- Creation and readback of independent domains/accounts.
- Wrong-instance administrator/user authentication denial and non-admin management denial.
- Authenticated SMTP over implicit TLS on port 465, local delivery, and JMAP message listing.
- No message appears in the other instance; an unauthorized SMTP envelope sender is rejected.
- Management-client response bounds, credential-bearing redirect refusal, response identity, per-object errors and uncertain write handling.

See [integration evidence](../../docs/architecture/mail-integration-evidence.md) for limits and remaining gates. This lab's lack of external DNS/HTTPS produces expected upstream messages about unavailable WebUI bundle downloads, Pyzor DNS and DNSSEC. Those network integrations are not claimed tested. The lab exercises APIs directly and does not need the downloaded Stalwart admin SPA.

## Operational implications found already

Object IDs are local to an installation: both independent domains/accounts can have the same ID. Application references must include the Webdock instance/customer binding.

Bootstrap creates port 465 submission by default in the pinned release; exposing 587 in Docker alone does not start a listener there. API management calls work through `/jmap` in the tested image.

An HTTP/JMAP success creating a `Tenant` object is not proof that CE enforces Enterprise tenancy. The lab verifies the edition and relies on physical instance/store separation, never that object.

The documented MTA strategy behavior can fall back to direct MX delivery when a named route is absent. Production must therefore verify referenced routes and enforce an independent egress policy allowing only the configured relays. A route-name string alone does not meet Webdock's no-fallback requirement. [Strategies](https://stalw.art/docs/mta/outbound/strategy/)

## Managed cluster profile

`Dockerfile` derives a non-root image from the pinned CE base and removes the
binary file capability, which otherwise prevents execution after dropping all
container capabilities. Build locally with:

```sh
docker build --network none -f infra/mail/Dockerfile -t webdock.local/mail-stalwart:0.16.25-restricted .
```

Production configuration uses the resulting immutable repository digest, never
this mutable build tag. See the [Mail agent setup](../../apps/hosting-agent/README.md#native-mail-agent-profile-source-implemented-not-deployed).
