# Project Notes first real extension

Owner approved Project Notes: project-scoped CRUD, project overview panel, optional reminder time via Core BullMQ. Build independently in spitzli/webdock-extension-project-notes using SDK/CLI; registry release requires real installation/use verification first.

1. Implement Core document read/CAS-write API against existing plugin_document and immutable receipt schema, with mandatory host invocation authority and RLS context. Extend the public SDK data API.
2. Build a reusable backend runtime + browser action bridge for local authoring, with no host tokens in frames and no plugin execution inside the host.
3. Scaffold Project Notes outside the monorepo, implement bounded note document CRUD and idempotent reminders. Own repo, no platform DB credentials.
4. Test real PostgreSQL/Core API, BullMQ and independent plugin process, including project isolation, stale writes, reminder change/delete and restart retention. Browser proof for the notes panel.
5. Document exact support and release gates. Do not publish an installable registry release before the actual host installer/container acceptance exists. The previous BullMQ fixture is not evidence for that gate.

Design choices: local JSON document storage (64 KiB cap), maximum 100 notes, optimistic revision conflict, reminder status visible in the project panel, no external notifications in v0.1. Use a host-bound MessageChannel for the panel; grants/context never come from iframe-supplied tenant IDs.
