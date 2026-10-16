import { test } from "node:test";
import assert from "node:assert/strict";
import { assertMailCanDisable } from "../src/server/lifecycle.ts";
test("fresh databases with no Mail schema can disable Mail", async () => {
  await assertMailCanDisable({
    query: async () => ({ rows: [{ relation: null }] }),
  });
});
test("retained services and accounts block shutdown even when suspended", async () => {
  for (const retained of [
    "webdock_mail.service",
    "webdock_auth.mail_connection",
    "webdock_auth.mail_tenant_account",
    "webdock_auth.mail_sender_domain",
    "webdock_auth.mail_provider_operation",
    "webdock_auth.mail_message",
    "webdock_mail.send_job",
    "webdock_auth.mail_callback_inbox",
    "webdock_auth.mail_webhook_delivery",
    "webdock_auth.mail_batch",
  ]) {
    await assert.rejects(
      () =>
        assertMailCanDisable({
          query: async (sql, values) => ({
            rows: sql.includes("to_regclass")
              ? [{ relation: values?.[0] === retained ? retained : null }]
              : [{ retained: true }],
          }),
        }),
      /retained/,
    );
  }
});
test("empty installed schemas allow shutdown; query failures never imply empty", async () => {
  await assertMailCanDisable({
    query: async (sql) => ({
      rows: sql.includes("to_regclass")
        ? [{ relation: "exists" }]
        : [{ retained: false }],
    }),
  });
  await assert.rejects(
    () =>
      assertMailCanDisable({
        query: async () => {
          throw Error("permission denied");
        },
      }),
    /permission denied/,
  );
  await assert.rejects(() =>
    assertMailCanDisable({ query: async () => ({ rows: [] }) }),
  );
});
test("native outbox inspection uses the explicitly supplied native reader", async () => {
  const seen: string[] = [];
  const product = {
    query: async (sql: string, values?: string[]) => {
      assert.ok(
        !sql.includes("webdock_mail.") &&
          !values?.[0]?.startsWith("webdock_mail."),
      );
      return { rows: [{ relation: null }] };
    },
  };
  const native = {
    query: async (sql: string, values?: string[]) => {
      seen.push(values?.[0] ?? sql);
      return {
        rows: sql.includes("to_regclass")
          ? [
              {
                relation:
                  values?.[0] === "webdock_mail.send_job"
                    ? "webdock_mail.send_job"
                    : null,
              },
            ]
          : [{ retained: true }],
      };
    },
  };
  await assert.rejects(() => assertMailCanDisable(product, native), /retained/);
  assert.ok(seen.includes("webdock_mail.send_job"));
});
