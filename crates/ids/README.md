# Private Webdock IDs

`webdock-ids` is an independently authored, non-published workspace library.
It uses a time/machine/generator/sequence bit layout, with explicit identities,
bounded signed-64-bit output and decimal-string JSON. No existing generator's
implementation is embedded or called. The only production dependencies are Serde
and thiserror, already used by this workspace.

The platform layout is immutable:

| Field | Bits | Range |
| --- | --- | --- |
| Milliseconds since 2026-01-01 UTC (`1767225600000`) | 41 | 0–2199023255551 |
| Machine | 6 | 0–63 |
| Generator within machine | 4 | 0–15 |
| Sequence within millisecond | 12 | 0–4095 |

The packed value is `elapsed * 2^22 + machine * 2^16 + generator * 2^12 + sequence`.
Combined identity slots `(machine << 4) | generator` 0 and 1 are reserved for
legacy database generators. Constructors and generation reject them. Decoding
old values remains possible; this crate never rewrites existing IDs. New platform
values are positive and fit the existing signed-i64/decimal-string record boundary.
`Id` JSON serialization and deserialization only accept strings; JavaScript must
keep these strings or use `BigInt`, never `Number`. Parsing rejects noncanonical
leading zeros, signs, whitespace, exponent notation, and values above `i64::MAX`.
Generic layouts can encode zero, which is not a platform record ID.

## Database integration

`Layout::next_after` computes a **candidate**, not an independently reserved ID:

```rust
use webdock_ids::{Id, Identity, Layout, PLATFORM_EPOCH_MS};
let identity = Identity::platform(0, 2)?;
// Inside a database transaction, lock the persistent row for this identity.
// Read its saved layout and high-water mark while holding that lock.
let saved_high_water: Option<Id> = None; // ONLY for a provably never-used identity.
let candidate = Layout::PLATFORM.next_after(identity, saved_high_water, PLATFORM_EPOCH_MS)?;
// Store candidate.as_i64() as high-water and COMMIT before returning candidate.
// The database row lock must stay held through that commit.
# Ok::<(), webdock_ids::Error>(())
```

Use one durable checkpoint row per namespace/layout/identity, with a unique key.
Initialize rows transactionally so simultaneous first writers cannot each see an
absent row. Validate the stored epoch and bit widths against the pinned layout;
an ID alone cannot prove which layout created it. Updating the high-water mark
must never move it backwards. A database allocator can serialize every allocation
with a row lock instead of granting one process permanent identity ownership.

For a process that already holds exclusive identity ownership,
`Generator::resume(layout, identity, high_water)` and
`generator.next_at(now_ms, persist_callback)` provide a synchronous convenience.
The callback must durably commit the supplied high-water mark before returning
`Ok(())`; the method then returns the ID. It consumes the in-memory candidate even
if persistence fails or its acknowledgement is uncertain. A no-op callback is
suitable only for tests, never a durable deployment. Async database callers should
use the pure primitive inside their existing transaction.

## Guarantees and operational limits

With a fixed layout, unique identities or serialized checkpoint access, and a
high-water mark durably committed before each released ID, IDs do not repeat.
Within one identity they increase strictly. Each millisecond supports 4096
platform IDs per identity. The library returns errors on rollback, exhaustion,
before-epoch timestamps, and end-of-layout overflow; it never wraps, sleeps,
spins, or silently advances time. Callers can retry after the clock advances.
There is no global chronological ordering across machines with skewed clocks.

The library does **not** allocate cluster identities, lock a file, acquire a lease,
or persist anything itself. PIDs, container hostnames, and truncated random values
are not unique assignments. A supervisor or database must coordinate ownership.
Lease-based deployments must fence a superseded owner before reusing an identity;
expiration alone cannot stop an old process from returning IDs.

On restart, acquire ownership/serialization first, then reload the authoritative
checkpoint. A missing, corrupt, restored, or rolled-back checkpoint is not proof
of a fresh identity: fail closed until the high-water mark is recovered or a
provably unused identity is allocated. An uncertain database commit must be
resolved against authoritative state before another allocator can reuse values.
Discarding unused committed IDs is safe. Separate uncoordinated layouts or epochs
can collide even when each is locally valid. Never use custom layouts in the
platform ID namespace. This library does not guarantee secrecy or unguessability.

## Verification

`cargo test -p webdock-ids` exercises layout/identity limits, signed boundaries,
strict string JSON, clock rollback, sequence exhaustion, restart/high-water
handling, failed persistence, synchronized concurrent producers, and exhaustive
packing uniqueness for a small layout. A test deliberately demonstrates the
collision from two uncoordinated producers using the same identity/checkpoint.
These are in-process simulations of the persistence contract, not a disk or
cluster crash-safety test; integration tests must verify the actual store.

`node crates/ids/tests/fixtures/packing.mjs --check` verifies the committed decimal
fixtures against an independent JavaScript BigInt arithmetic oracle. Rust checks
those same fixtures, including the `i64::MAX` boundary.
