import { test, expect } from "bun:test";
import type { Pool } from "pg";
import type { ClerkExternalEvidence } from "@webdock/adapter-auth-clerk";
import {
  createClerkSessionBridge,
  allowedClerkProjection,
  type BridgeUser,
} from "../src/modules/auth/clerk-bridge";
const now = 1_800_000_000_000;
const evidence: ClerkExternalEvidence = {
  external: {
    issuer: "https://clerk.example.test",
    subject: "user_example",
    sessionID: "sess_example",
  },
  user: {
    id: "user_example",
    banned: false,
    locked: false,
    twoFactorEnabled: true,
    emailVerified: true,
  },
  expiresAt: now + 120_000,
  factorVerificationAge: [0, 0],
};
const user: BridgeUser = {
  id: "123",
  name: "Operator",
  email: "local@example.test",
  role: "operator",
  banned: false,
  emailVerified: true,
  twoFactorEnabled: true,
  mustChangePassword: false,
};
function fixture(
  options: {
    mapped?: boolean;
    existing?: {
      userId: string;
      external_subject: string;
      local_session_id: string;
      token: string;
    };
    external?: ClerkExternalEvidence | null;
    local?: BridgeUser;
  } = {},
) {
  const calls: { sql: string; values: unknown[] }[] = [];
  let connections = 0;
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      const rows = sql.startsWith("SELECT u.id")
        ? options.mapped === false
          ? []
          : [options.local ?? user]
        : sql.startsWith("SELECT m.local_session_id")
          ? options.existing
            ? [options.existing]
            : []
          : sql.startsWith("INSERT INTO webdock_auth.session")
            ? [{ id: "456", token: "private-native-token" }]
            : [];
      return { rows, rowCount: rows.length };
    },
    release() {},
  };
  const database = {
    connect: async () => {
      connections++;
      return client;
    },
  } as unknown as Pick<Pool, "connect">;
  const bridge = createClerkSessionBridge({
    database,
    verifyExternal: async () =>
      options.external === undefined ? evidence : options.external,
    signSession: async () => "private-cookie=signed-native-token",
    origin: "https://auth.example.test",
    now: () => now,
  });
  return {
    bridge,
    calls,
    get connections() {
      return connections;
    },
  };
}
test("Clerk bridge requires an explicit local mapping and never matches email", async () => {
  const f = fixture({ mapped: false });
  await expect(
    f.bridge(new Headers({ authorization: "Bearer clerk.token" })),
  ).rejects.toThrow();
  expect(f.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
  expect(
    f.calls.filter((c) => c.sql.startsWith("SELECT u.id"))[0].values,
  ).toEqual([evidence.external.issuer, evidence.external.subject]);
});
test("Clerk bridge fails closed before database access for invalid or absent external proof", async () => {
  for (const headers of [
    new Headers(),
    new Headers({ cookie: "webdock-auth.session_token=legacy" }),
    new Headers({ authorization: "Bearer invalid" }),
  ]) {
    const f = fixture({ external: null });
    await expect(f.bridge(headers)).rejects.toThrow();
    expect(f.connections).toBe(0);
  }
});
test("real external MFA never substitutes for incomplete local setup or an unverified second factor", () => {
  expect(allowedClerkProjection(user, evidence)).toBe(true);
  for (const proof of [
    { ...evidence, factorVerificationAge: null },
    { ...evidence, factorVerificationAge: [0, -1] as [number, number] },
    { ...evidence, user: { ...evidence.user, twoFactorEnabled: false } },
  ])
    expect(allowedClerkProjection(user, proof)).toBe(false);
  for (const local of [
    { ...user, twoFactorEnabled: false },
    { ...user, mustChangePassword: true },
    { ...user, banned: true },
    { ...user, emailVerified: false },
  ])
    expect(allowedClerkProjection(local, evidence)).toBe(false);
});
test("Clerk projection bounds local expiry and keeps native credentials out of its safe browser shape", async () => {
  const f = fixture();
  const projected = await f.bridge(
    new Headers({ authorization: "Bearer verified.token" }),
  );
  expect(projected.actor).toEqual({ userID: "123", sessionID: "456" });
  expect(projected.headers.get("cookie")).toBe(
    "private-cookie=signed-native-token",
  );
  expect(JSON.stringify(projected.safe)).not.toContain("token");
  expect(JSON.stringify(projected.safe)).not.toContain("cookie");
  const inserted = f.calls.find((c) =>
    c.sql.startsWith("INSERT INTO webdock_auth.session"),
  )!;
  expect(inserted.values[2]).toEqual(new Date(now + 60_000));
  expect(projected.safe.user.id).toBe("123");
});
test("projection cannot reuse a session bound to another immutable subject", async () => {
  const f = fixture({
    existing: {
      userId: "999",
      external_subject: evidence.external.subject,
      local_session_id: "456",
      token: "private",
    },
  });
  await expect(
    f.bridge(new Headers({ authorization: "Bearer valid.token" })),
  ).rejects.toThrow();
  expect(f.calls.some((c) => c.sql.startsWith("INSERT"))).toBe(false);
});
test("lease is refreshed before native session update so database clamp permits only the verified expiry", async () => {
  const f = fixture({
    existing: {
      userId: "123",
      external_subject: evidence.external.subject,
      local_session_id: "456",
      token: "private",
    },
  });
  await f.bridge(new Headers({ authorization: "Bearer valid.token" }));
  expect(
    f.calls.findIndex((c) =>
      c.sql.startsWith("INSERT INTO webdock_auth.clerk_session_mapping"),
    ),
  ).toBeLessThan(
    f.calls.findIndex((c) => c.sql.startsWith("UPDATE webdock_auth.session")),
  );
});
