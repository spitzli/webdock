import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { isIP } from "node:net";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import nodemailer from "nodemailer";
import { StalwartClient } from "../../src/stalwart/client.ts";

const composeFile = fileURLToPath(new URL("../../../../infra/mail/compose.test.yml", import.meta.url));
const project = process.env.MAIL_TEST_PROJECT;
assert.match(project || "", /^webdock-mail-test-[a-z0-9-]+$/, "Use npm run test:integration -w @webdock/mail.");
const compose = (...args: string[]) => execFileSync("docker", ["compose", "-p", project!, "-f", composeFile, ...args], { encoding: "utf8", timeout: 30_000 });
const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
async function eventually<T>(operation: () => Promise<T>): Promise<T> {
  const until = Date.now() + 15_000;
  for (;;) {
    try { return await operation(); }
    catch (error) { if (Date.now() >= until) throw error; await setTimeout(200); }
  }
}

function instance(key: string) {
  const service = `customer-${key}`;
  const id = compose("ps", "-q", service).trim();
  assert.match(id, /^[a-f0-9]{64}$/);
  const [container] = JSON.parse(execFileSync("docker", ["inspect", id], { encoding: "utf8" }));
  assert.equal(container.Config.Labels["com.docker.compose.project"], project);
  const network = container.NetworkSettings.Networks[`${project}_${service}`];
  assert.ok(network);
  const [networkInfo] = JSON.parse(execFileSync("docker", ["network", "inspect", network.NetworkID], { encoding: "utf8" }));
  assert.equal(networkInfo.Internal, true);
  assert.equal(isIP(network.IPAddress), 4);
  const url = `http://${network.IPAddress}:8080`;
  return { key, service, ip: network.IPAddress as string, url, domain: `${service}.test`,
    password: `Webdock-Fixture-Only-${key}!123456`,
    client: new StalwartClient({ url, authorization: basic("admin", `webdock-local-test-only-${key}`), allowInsecureHttp: true }),
  };
}
let instances: ReturnType<typeof instance>[];
let accountIDs: string[];
test.before(async () => {
  instances = [instance("a"), instance("b")];
  accountIDs = [];
  for (const item of instances) {
    await eventually(() => item.client.call("x:Bootstrap/get", { ids: ["singleton"] }));
    await item.client.call("x:Bootstrap/set", { update: { singleton: {
      serverHostname: `mail.${item.domain}`, defaultDomain: item.domain,
      requestTlsCertificate: false, generateDkimKeys: false, tracer: { "@type": "Stdout", level: "warn" },
    } } });
    compose("restart", item.service);
    const domains = await eventually(() => item.client.call("x:Domain/get", { ids: null }));
    const domain = (domains.list as { id: string; name: string }[]).find(value => value.name === item.domain);
    assert.ok(domain);
    const accounts = await item.client.call("x:Account/set", { create: { mailbox: {
      "@type": "User", name: "alice", domainId: domain.id,
      credentials: { "0": { "@type": "Password", secret: item.password } },
      roles: { "@type": "User" }, permissions: { "@type": "Inherit" },
      encryptionAtRest: { "@type": "Disabled" }, quotas: { maxDiskQuota: 10_485_760 },
    } } });
    accountIDs.push((accounts.created as { mailbox: { id: string } }).mailbox.id);
  }
});

test("CE instances have separate domains and reject the other instance's administrator", async () => {
  assert.notEqual(instances[0].url, instances[1].url);
  for (const item of instances) {
    const denied = new StalwartClient({ url: item.url, authorization: basic("admin", `webdock-local-test-only-${item.key === "a" ? "b" : "a"}`), allowInsecureHttp: true });
    await assert.rejects(denied.call("x:Domain/get", { ids: null }), /request failed/);
    const result = await item.client.call("x:Domain/get", { ids: null });
    assert.deepEqual((result.list as { name: string }[]).map(domain => domain.name), [item.domain]);
    const account = await fetch(`${item.url}/api/account`, { headers: { Authorization: basic("admin", `webdock-local-test-only-${item.key}`) }, signal: AbortSignal.timeout(5000) });
    assert.equal((await account.json()).edition, "community");
  }
});

test("a user cannot authenticate against another instance or manage their own server", async () => {
  const [a, b] = instances;
  const foreign = await fetch(`${b.url}/.well-known/jmap`, { headers: { Authorization: basic(`alice@${a.domain}`, a.password) }, signal: AbortSignal.timeout(5000) });
  assert.equal(foreign.status, 401);
  const own = new StalwartClient({ url: a.url, authorization: basic(`alice@${a.domain}`, a.password), allowInsecureHttp: true });
  await assert.rejects(own.call("x:Account/get", { ids: null }), /rejected/);
});

test("authenticated SMTP delivers into JMAP on the same instance without leaking to the other instance", async () => {
  const [a, b] = instances;
  const mailer = nodemailer.createTransport({ host: a.ip, port: 465, secure: true,
    auth: { user: `alice@${a.domain}`, pass: a.password },
    // Only this egress-blocked, disposable fixture uses Stalwart's self-signed certificate.
    tls: { rejectUnauthorized: false }, connectionTimeout: 5000, socketTimeout: 10000,
  });
  try {
    const sent = await mailer.sendMail({ from: `alice@${a.domain}`, to: `alice@${a.domain}`, subject: "Webdock isolation fixture", text: "Only account A may read this message." });
    assert.deepEqual(sent.accepted, [`alice@${a.domain}`]);
    const query = async (item: typeof a, accountId: string) => {
      const response = await fetch(`${item.url}/jmap`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: basic(`alice@${item.domain}`, item.password) },
        body: JSON.stringify({ using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], methodCalls: [["Email/query", { accountId }, "emails"]] }), signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.methodResponses[0][0], "Email/query");
      return body.methodResponses[0][1].ids as string[];
    };
    await eventually(async () => assert.equal((await query(a, accountIDs[0])).length, 1));
    assert.equal((await query(b, accountIDs[1])).length, 0);
    await assert.rejects(mailer.sendMail({ from: `alice@${b.domain}`, to: `alice@${a.domain}`, subject: "Forged envelope", text: "Must fail" }));
  } finally { mailer.close(); }
});
