# Storage module boundary

The existing storage inventory service now lives in `modules/storage`. Its typed factory receives a scoped database pool, local authentication/tenant checks, module admission, secret sealing/opening and inventory provider functions. `apps/control-plane/src/modules/platform/storage-usage.ts` composes the ports and preserves prior entrypoints.

`adapters/storage/vercel` owns the existing Vercel Blob token/store validation, URL validation, bounded pagination, duplicate detection, 30-second cancellation and complete-snapshot measurement. No provider SDK or environment secret is imported by the Storage module. Tests may still inject the existing list transport through the compatibility entrypoint.

Adding a connection requires an enabled module; existing refresh/disconnect work remains available while draining. The scheduled batch requires active module access. Removing a mapping never removes stored objects. Failed/incomplete measurements preserve the previous snapshot and remain marked unavailable rather than counted as zero.

Storage connection controls live in `modules/storage/src/ui/connections.tsx`, receiving public metadata and a client-side form renderer that retains the app's authenticated server action. The core plan/allowance interface remains independent of optional Storage and Billing. Disabled optional products are not contacted by the plan/usage dashboard, and their panels are hidden.

No schema or resource-binding migration was performed. Existing IDs, encrypted token AAD (`storage:<id>`), store-prefix ownership locks, revision fencing, customer checks and audit records are retained. No external storage call or object deletion is performed by this extraction.
