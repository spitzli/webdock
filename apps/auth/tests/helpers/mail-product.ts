/** Check before importing modules that own a pool, not only before fixture writes. */
export function assertMailTestDatabase(raw: string, env: NodeJS.ProcessEnv = process.env): void {
  const url = new URL(raw);
  if (!["postgresql:", "postgres:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.pathname !== "/webdock_admin_test" || url.search || url.hash ||
      env.AUTH_TEST_MAIL !== "true" || env.NODE_ENV === "production" || env.VERCEL_ENV) {
    throw Error("Disposable local Mail test database required");
  }
}

export function validEmail() {
  return { from: "sender@example.invalid", to: "delivered@test.mail.webdock.dev", subject: "Mail fixture", text: "Synthetic test content" };
}

export async function withMailFixture<T>(run: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<T>): Promise<T> {
  assertMailTestDatabase(process.env.DATABASE_URL!);
  const fixture = await createFixture();
  try { return await run(fixture); }
  finally { await fixture.cleanup(); }
}

async function createFixture() {
  assertMailTestDatabase(process.env.DATABASE_URL!);
  const { randomBytes } = await import('node:crypto');
  const { database: db } = await import('../../src/lib/db');
  const { auth } = await import('../../src/lib/auth');
  const { createIdentity } = await import('../../src/lib/bootstrap');
  const suffix = randomBytes(8).toString('hex');
  const users: string[] = [], customers: string[] = [], organizations: string[] = [];
  async function identity(label: string, operator = false) {
    const password = randomBytes(32).toString('base64url');
    const user = await createIdentity({ name: 'Mail fixture', email: `${label}-${suffix}@example.invalid`, password, operator, mustChangePassword: false });
    users.push(user.id);
    const origin = process.env.BETTER_AUTH_URL!;
    const response = await auth.handler(new Request(origin + '/api/auth/sign-in/email', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'x-vercel-forwarded-for': `192.0.2.${1 + randomBytes(1)[0] % 250}` }, body: JSON.stringify({ email: user.email, password }),
    }));
    if (response.status !== 200) throw Error('Fixture sign-in failed');
    if (operator) await db.query('UPDATE webdock_auth."user" SET "twoFactorEnabled"=true WHERE id=$1', [user.id]);
    const headers = new Headers({ Origin: origin, Cookie: response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') });
    const session = await auth.api.getSession({ headers });
    if (!session) throw Error('Fixture session missing');
    return { id: user.id, headers, principal: { kind: 'session' as const, userID: user.id, sessionID: session.session.id } };
  }
  async function cleanup() {
    await db.query('DELETE FROM webdock_auth.access_event WHERE actor_id=ANY($1)', [users]);
    await db.query('DELETE FROM webdock_auth.member WHERE "userId"=ANY($1)', [users]);
    await db.query('DELETE FROM webdock_auth.tenant_customer WHERE customer_id=ANY($1)', [customers]);
    await db.query('DELETE FROM webdock_admin.customers WHERE id=ANY($1)', [customers]);
    await db.query('DELETE FROM webdock_auth.organization WHERE id=ANY($1)', [organizations]);
    await db.query('DELETE FROM webdock_auth."user" WHERE id=ANY($1)', [users]);
  }
  try {
    const admin = await identity('admin'), other = await identity('other'), member = await identity('member'), operator = await identity('operator', true);
    for (const who of [admin, other]) {
      const c = (await db.query("INSERT INTO webdock_admin.customers(id,name) VALUES(webdock_auth.next_snowflake(),$1) RETURNING id", ['Mail fixture '+suffix])).rows[0];
      customers.push(c.id);
      const t = (await db.query('SELECT organization_id FROM webdock_auth.tenant_customer WHERE customer_id=$1', [c.id])).rows[0];
      organizations.push(t.organization_id);
      await db.query('INSERT INTO webdock_auth.member("organizationId","userId",role,"createdAt") VALUES($1,$2,\'admin\',now())', [t.organization_id, who.id]);
    }
    await db.query('INSERT INTO webdock_auth.member("organizationId","userId",role,"createdAt") VALUES($1,$2,\'member\',now())', [organizations[0], member.id]);
    return {
      db, suffix, customers, organizations, admin, other, member, operator,
      adminHeaders: admin.headers, memberHeaders: member.headers, operatorHeaders: operator.headers,
      now: new Date('2026-10-12T12:00:00Z'),
      setNow(instant: Date) { this.now = instant; }, cleanup,
    };
  } catch (error) { await cleanup(); throw error; }
}
