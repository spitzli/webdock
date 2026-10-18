# Webdock plugin contracts (implementation in progress)

This package currently provides the runtime-neutral `@webdock/plugin-sdk/contracts`
entry point: strict manifest validation, capability/method metadata, lifecycle
DTOs and a generated Tabularium extension schema. It builds compiled ESM and TypeScript
declarations; `npm pack` is tested in an empty directory with an offline install.

The server, UI and testing entry points, host services and scaffolding CLI are not
implemented yet. Method catalog entries describe the planned wire protocol, not
available adapters. Do not publish this package as a complete developer platform.

```ts
import { parsePluginManifest } from '@webdock/plugin-sdk/contracts';
const manifest = parsePluginManifest(untrustedManifest);
```

Parsing validates shape and semantics, not registry trust. Hosts must verify release
identity/signature, exact manifest/descriptor bytes and image origin before using
this parser's result. Configuration/action schemas use a bounded local JSON Schema
subset with at most three nested child schemas; `$ref`, code and arbitrary schema
keywords are rejected. Images require a SHA-256 digest. Migrations are declarative;
checksum verification and execution belong to the future verified migration service.

From the repository root:

```sh
npm run build -w @webdock/plugin-sdk
npm run test:modules
node --import tsx tools/plugins/generate-schema.ts --check
```
