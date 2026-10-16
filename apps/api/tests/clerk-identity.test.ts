import { describe, test, expect } from "bun:test";
import {
  createConsoleVerifier,
  ConsoleAuthError,
  type ConsoleIdentityDependencies,
} from "../src/modules/auth/clerk-identity";
const issuer = "https://fixture.clerk.accounts.dev",
  origin = "https://console.example.test";
function fixture() {
  const state = {
    sub: "user_one",
    sid: "sess_one",
    iss: issuer,
    azp: origin,
    exp: Math.floor(Date.now() / 1000) + 60,
    orgId: "org_one",
  };
  const local = {
    id: "1001",
    name: "Fixture",
    email: "fixture@example.test",
    role: "user",
    banned: false,
    enabled: true,
    emailVerified: true,
  };
  const user = {
    id: "user_one",
    banned: false,
    locked: false,
    primaryEmailAddressId: "email_one",
    emailAddresses: [{ id: "email_one", verification: { status: "verified" } }],
  };
  const session = {
    id: "sess_one",
    userId: "user_one",
    status: "active",
    expireAt: Date.now() + 60000,
  };
  const member = { organization: { id: "org_one" }, role: "org:admin" };
  const deps: ConsoleIdentityDependencies = {
    verify: async () => state,
    session: async () => session,
    user: async () => user,
    identity: async () => local,
    organization: async () => ({
      id: "2001",
      customerID: "3001",
      active: true,
      enabled: true,
    }),
    memberships: async () => [member],
  };
  const verify = createConsoleVerifier(
    { issuer, authorizedParties: [origin], serviceKey: "s".repeat(32) },
    deps,
  );
  const request = () =>
    new Request("https://api.example.test/v1/console", {
      headers: {
        authorization: "Bearer signed-session",
        "x-webdock-service-key": "s".repeat(32),
      },
    });
  return { state, local, user, session, member, deps, verify, request };
}
describe("Clerk Console trust boundary", () => {
  test("uses immutable mapping and live membership without legacy session", async () => {
    const f = fixture(),
      p = await f.verify(f.request());
    expect(p.provider).toBe("clerk");
    expect(p.userID).toBe("1001");
    expect(p.customerID).toBe("3001");
    expect(p.role).toBe("admin");
    expect(p.operator).toBe(false);
  });
  test("local operator is independent of organization role", async () => {
    const f = fixture();
    f.local.role = "operator";
    f.state.orgId = "";
    const p = await f.verify(f.request());
    expect(p.operator).toBe(true);
    expect(p.customerID).toBeNull();
  });
  for (const field of ["iss", "azp", "sub", "sid"] as const)
    test(`rejects wrong ${field}`, async () => {
      const f = fixture();
      f.state[field] = "wrong";
      await expect(f.verify(f.request())).rejects.toBeInstanceOf(
        ConsoleAuthError,
      );
    });
  test("rejects expired JWT even if live session remains active", async () => {
    const f = fixture();
    f.state.exp = 1;
    await expect(f.verify(f.request())).rejects.toMatchObject({ status: 401 });
  });
  test("requires service credential before provider access", async () => {
    const f = fixture();
    let calls = 0;
    f.deps.verify = async () => {
      calls++;
      return f.state;
    };
    await expect(
      f.verify(new Request("https://api.example.test")),
    ).rejects.toMatchObject({ status: 401 });
    expect(calls).toBe(0);
  });
  test("never maps an unknown user by email", async () => {
    const f = fixture();
    f.deps.identity = async () => null;
    await expect(f.verify(f.request())).rejects.toMatchObject({ status: 403 });
  });
  test("rejects disabled local mapping and suspended account", async () => {
    for (const field of ["enabled", "banned"] as const) {
      const f = fixture();
      f.local[field] = field === "banned";
      await expect(f.verify(f.request())).rejects.toMatchObject({
        status: 403,
      });
    }
  });
  test("requires verified primary email", async () => {
    const f = fixture();
    f.user.emailAddresses[0].verification.status = "unverified";
    await expect(f.verify(f.request())).rejects.toMatchObject({ status: 403 });
  });
  test("revoked session denies next request", async () => {
    const f = fixture();
    await f.verify(f.request());
    f.session.status = "revoked";
    await expect(f.verify(f.request())).rejects.toMatchObject({ status: 401 });
  });
  test("removed member denies next request despite stale JWT", async () => {
    const f = fixture();
    await f.verify(f.request());
    f.deps.memberships = async () => [];
    await expect(f.verify(f.request())).rejects.toMatchObject({ status: 403 });
  });
  test("inactive customer and unsupported role deny", async () => {
    const f = fixture();
    f.member.role = "org:operator";
    await expect(f.verify(f.request())).rejects.toMatchObject({ status: 403 });
    f.member.role = "org:admin";
    f.deps.organization = async () => ({
      id: "2001",
      customerID: "3001",
      active: false,
      enabled: true,
    });
    await expect(f.verify(f.request())).rejects.toMatchObject({ status: 403 });
  });
  test("provider outages are availability errors, with no fallback", async () => {
    const f = fixture();
    f.deps.session = async () => {
      throw Error("secret provider detail");
    };
    await expect(f.verify(f.request())).rejects.toMatchObject({
      status: 503,
      message: "Identity service is temporarily unavailable.",
    });
  });
});
test("projects an invited user only after live verified membership", async () => {
  const f = fixture();
  let projected = false,
    calls = 0;
  Object.assign(f.user.emailAddresses[0], {
    emailAddress: "new@example.invalid",
  });
  f.deps.identity = async () => (projected ? f.local : null);
  f.deps.projectIdentity = async () => {
    calls++;
    projected = true;
  };
  f.deps.memberships = async () => [];
  await expect(f.verify(f.request())).rejects.toMatchObject({ status: 403 });
  expect(calls).toBe(0);
  f.deps.memberships = async () => [f.member];
  expect((await f.verify(f.request())).userID).toBe(f.local.id);
  expect(calls).toBe(1);
});
