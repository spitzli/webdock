import { test, expect, afterAll } from "bun:test";
import { randomUUID } from "node:crypto";
import { withDatabaseScope } from "@webdock/database-runtime";
import { billingFixture } from "./helpers/billing";
const enabled = process.env.WEBDOCK_RLS_FIXTURE_FILE;
afterAll(async () => {
  if (enabled) await (await import("../src/db/runtime")).databasePools.close();
});
for (const environment of ["sandbox", "live"] as const)
  (enabled ? test : test.skip)(
    environment +
      " reconciliation requires paid proof, preserves extras and rejects stale reads",
    async () => {
      const f = await billingFixture(environment),
        { databasePools } = await import("../src/db/runtime");
      const { quotePurchase, createCheckout } =
        await import("../src/modules/billing/checkout");
      const { reconcileCustomer } =
        await import("../src/modules/billing/reconcile");
      const input = {
        environment,
        customerID: f.customer,
        versionID: f.version,
        projectID: f.project,
        bindingID: f.binding,
      };
      const polarCustomer = randomUUID(),
        subscriptionID = randomUUID();
      let checkout: Record<string, unknown> | undefined;
      const previous = {
          storageBytes: 100,
          mailMessages: 5,
          transferBytes: 0,
          websites: 1,
          editors: 1,
        },
        extras = {
          storageBytes: 200,
          mailMessages: 10,
          transferBytes: 0,
          websites: 0,
          editors: 2,
        };
      try {
        await f.owner.query(
          "INSERT INTO webdock_auth.tenant_subscription(customer_id,name,description,base,extras,revision,updated_by) VALUES($1,'Manual','Before billing',$2,$3,1,$4)",
          [
            f.customer,
            JSON.stringify(previous),
            JSON.stringify(extras),
            f.actor.subject,
          ],
        );
        const quote = await quotePurchase(f.actor, input);
        await createCheckout(
          f.actor,
          { ...input, acceptTerms: true, termsHash: quote.termsHash },
          async () => ({
            find: async () => [],
            get: async () => checkout,
            create: async (terms) => {
              checkout = {
                id: randomUUID(),
                organization_id: terms.organizationID,
                external_customer_id: "webdock:" + terms.customerID,
                customer_id: polarCustomer,
                status: "succeeded",
                url:
                  (environment === "sandbox"
                    ? "https://sandbox.polar.sh"
                    : "https://polar.sh") +
                  "/checkout/fixture-" +
                  terms.operationID,
                expires_at: new Date(Date.now() + 3600000).toISOString(),
                success_url: terms.successURL,
                return_url: terms.returnURL,
                product_id: terms.productID,
                product_price_id: terms.priceID,
                products: [{ id: terms.productID }],
                product: {
                  id: terms.productID,
                  recurring_interval: terms.interval,
                  recurring_interval_count: 1,
                },
                product_price: {
                  id: terms.priceID,
                  product_id: terms.productID,
                  amount_type: "fixed",
                  price_amount: terms.amount,
                  price_currency: "eur",
                  tax_behavior: terms.taxBehavior,
                },
                allow_trial: false,
                active_trial_interval: null,
                active_trial_interval_count: null,
                trial_end: null,
                allow_discount_codes: false,
                discount_id: null,
                discount_amount: 0,
                currency: "eur",
                metadata: {
                  webdock_contract_id: terms.contractID,
                  webdock_operation_id: terms.operationID,
                },
              };
              return { id: String(checkout.id) };
            },
          }),
        );
        const currentSubscription: Record<string, unknown> = {
          id: subscriptionID,
          customer_id: polarCustomer,
          product_id: f.polarProduct,
          checkout_id: checkout!.id,
          customer: {
            id: polarCustomer,
            organization_id: f.organization,
            external_id: "webdock:" + f.customer,
          },
          product: { id: f.polarProduct, organization_id: f.organization },
          status: "active",
          amount: 5880,
          currency: "eur",
          recurring_interval: "year",
          recurring_interval_count: 1,
          trial_start: null,
          trial_end: null,
          discount_id: null,
          current_period_start: "2026-10-14T00:00:00Z",
          current_period_end: "2027-10-14T00:00:00Z",
          cancel_at_period_end: false,
          canceled_at: null,
          pending_update: null,
          metadata: {},
          prices: [
            {
              id: f.price,
              product_id: f.polarProduct,
              amount_type: "fixed",
              price_amount: 5880,
              price_currency: "eur",
              tax_behavior: "inclusive",
            },
          ],
        };
        const remote = {
          complete: true as const,
          customer: {
            id: polarCustomer,
            organization_id: f.organization,
            external_id: "webdock:" + f.customer,
            email: "billing@example.invalid",
          },
          checkouts: [checkout!],
          subscriptions: [currentSubscription],
          orders: [] as Record<string, unknown>[],
        };
        const provider = async () => ({
          organizationID: f.organization,
          read: async () => structuredClone(remote),
        });
        await reconcileCustomer(environment, f.customer, provider);
        expect(
          (
            await f.owner.query(
              "SELECT revision FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
              [f.customer],
            )
          ).rows[0].revision,
        ).toBe(1);
        remote.orders.push({
          id: randomUUID(),
          customer_id: polarCustomer,
          product_id: f.polarProduct,
          subscription_id: subscriptionID,
          checkout_id: checkout!.id,
          status: "paid",
          paid: true,
          billing_reason: "subscription_create",
          net_amount: 4941,
          tax_amount: 939,
          total_amount: 5880,
          discount_amount: 0,
          currency: "eur",
          refunded_amount: 0,
          refunded_tax_amount: 0,
        });
        await reconcileCustomer(environment, f.customer, provider);
        await reconcileCustomer(environment, f.customer, provider);
        const applied = (
          await f.owner.query(
            "SELECT base,extras,revision FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
            [f.customer],
          )
        ).rows[0];
        expect(applied.extras).toEqual(extras);
        expect(applied.revision).toBe(environment === "live" ? 2 : 1);
        expect(applied.base.storageBytes).toBe(
          environment === "live" ? 500000000 : 100,
        );

        if (environment === "live") {
          const { quoteSubscriptionChange, changeSubscription } =
            await import("../src/modules/billing/subscriptions");
          const localSubscription = (
            await f.owner.query(
              "SELECT id FROM webdock_auth.billing_subscription WHERE customer_id=$1",
              [f.customer],
            )
          ).rows[0].id;
          const targets = new Map<string, Record<string, unknown>>();
          async function target(
            amount: number,
            mediaBytes: string,
            editors: number,
            newProduct = false,
          ) {
            const versionID = (
                await f.owner.query(
                  "SELECT webdock_auth.next_snowflake() AS id",
                )
              ).rows[0].id as string,
              polarProduct = randomUUID(),
              priceID = randomUUID(),
              operation = randomUUID();
            let product = f.product;
            if (newProduct) {
              product = (
                await f.owner.query(
                  "SELECT webdock_auth.next_snowflake() AS id",
                )
              ).rows[0].id;
              f.extraProducts.push(product);
              await f.owner.query(
                "INSERT INTO webdock_auth.billing_product(id,sku,name,family,visibility,operationally_ready) VALUES($1,$2,'Current Mini','website','public',true)",
                [product, "change-" + product],
              );
            }
            const identity = (
              await f.owner.query(
                "SELECT sku,name FROM webdock_auth.billing_product WHERE id=$1",
                [product],
              )
            ).rows[0];
            await f.owner.query(
              "INSERT INTO webdock_auth.billing_product_version(id,product_id,version,amount,currency,tax_behavior,interval,description,terms_text,entitlements,terms_hash,frozen) VALUES($1,$2,$3,$4,'EUR','inclusive','year','Change fixture','Changed annual agreement',$5,$6,true)",
              [
                versionID,
                product,
                newProduct ? 1 : 2,
                amount,
                JSON.stringify({
                  websites: 1,
                  editors,
                  mediaBytes,
                  mailMonthly: 100,
                }),
                "b".repeat(64),
              ],
            );
            await f.owner.query(
              "INSERT INTO webdock_auth.billing_product_mapping(environment,version_id,polar_product_id,price_ids,status,operation_id,desired_hash) VALUES('live',$1,$2,$3,'ready',$4,$5)",
              [
                versionID,
                polarProduct,
                JSON.stringify([priceID]),
                operation,
                "b".repeat(64),
              ],
            );
            const price = {
              id: priceID,
              product_id: polarProduct,
              source: "catalog",
              amount_type: "fixed",
              price_amount: amount,
              price_currency: "eur",
              tax_behavior: "inclusive",
              is_archived: false,
            };
            targets.set(polarProduct, {
              id: polarProduct,
              organization_id: f.organization,
              name: identity.name,
              description: "Change fixture",
              is_archived: false,
              is_recurring: true,
              recurring_interval: "year",
              recurring_interval_count: 1,
              trial_interval: null,
              trial_interval_count: null,
              visibility: "public",
              metadata: {
                webdock_sku: identity.sku,
                webdock_version_id: versionID,
                webdock_operation_id: operation,
                webdock_hash: "b".repeat(64),
              },
              prices: [price],
            });
            return { versionID, polarProduct, price, amount };
          }
          const up = await target(11880, "2000000000", 3);
          let writes = 0,
            loseResponse = true;
          const updates = {
            organizationID: f.organization,
            product: async (id: string) => targets.get(id),
            get: async () => structuredClone(currentSubscription),
            orders: async () =>
              remote.orders.map((order) => ({
                id: String(order.id),
                status: String(order.status),
              })),
            update: async (
              _id: string,
              productID: string,
              mode: "invoice" | "next_period",
              metadata: Record<string, string>,
            ) => {
              writes++;
              currentSubscription.metadata = metadata;
              if (mode === "invoice") {
                const product = targets.get(productID)!;
                currentSubscription.product_id = productID;
                currentSubscription.product = {
                  id: productID,
                  organization_id: f.organization,
                };
                currentSubscription.prices = product.prices;
                currentSubscription.amount = (
                  product.prices as { price_amount: number }[]
                )[0].price_amount;
              } else
                currentSubscription.pending_update = {
                  product_id: productID,
                  applies_at: currentSubscription.current_period_end,
                };
              if (loseResponse) {
                loseResponse = false;
                throw Error("Synthetic subscription update response lost");
              }
              return structuredClone(currentSubscription);
            },
          };
          const selection = {
            environment,
            customerID: f.customer,
            subscriptionID: localSubscription,
            versionID: up.versionID,
          };
          const quoted = await quoteSubscriptionChange(f.actor, selection);
          expect(quoted.direction).toBe("upgrade");
          const accept = {
            ...selection,
            operationID: quoted.operationID,
            termsHash: quoted.termsHash,
            acceptTerms: true,
          };
          await expect(
            changeSubscription(f.actor, accept, async () => updates),
          ).rejects.toHaveProperty("status", 502);
          expect(
            (await changeSubscription(f.actor, accept, async () => updates))
              .state,
          ).toBe("awaiting_payment");
          expect(writes).toBe(1);
          await reconcileCustomer(environment, f.customer, provider);
          expect(
            (
              await f.owner.query(
                "SELECT revision FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
                [f.customer],
              )
            ).rows[0].revision,
          ).toBe(2);
          remote.orders.push({
            id: randomUUID(),
            customer_id: polarCustomer,
            product_id: up.polarProduct,
            subscription_id: subscriptionID,
            checkout_id: null,
            status: "paid",
            paid: true,
            billing_reason: "subscription_update",
            net_amount: 5042,
            tax_amount: 958,
            total_amount: 6000,
            discount_amount: 0,
            currency: "eur",
            refunded_amount: 0,
            refunded_tax_amount: 0,
          });
          await reconcileCustomer(environment, f.customer, provider);
          const upgraded = (
            await f.owner.query(
              "SELECT base,extras,revision FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
              [f.customer],
            )
          ).rows[0];
          expect(upgraded.base.storageBytes).toBe(2000000000);
          expect(upgraded.revision).toBe(3);
          expect(upgraded.extras).toEqual(extras);
          const down = await target(5880, "500000000", 1, true),
            periodEnd = new Date(Date.now() + 1500);
          currentSubscription.current_period_start = new Date(
            Date.now() - 86400000,
          ).toISOString();
          currentSubscription.current_period_end = periodEnd.toISOString();
          await reconcileCustomer(environment, f.customer, provider);
          const downgrade = { ...selection, versionID: down.versionID },
            downQuote = await quoteSubscriptionChange(f.actor, downgrade);
          expect(downQuote.direction).toBe("downgrade");
          const downAccept = {
            ...downgrade,
            operationID: downQuote.operationID,
            termsHash: downQuote.termsHash,
            acceptTerms: true,
          };
          let firstStarted!: () => void,
            secondStarted!: () => void,
            releaseRead!: () => void,
            sent!: () => void;
          const firstReady = new Promise<void>((resolve) => {
              firstStarted = resolve;
            }),
            secondReady = new Promise<void>((resolve) => {
              secondStarted = resolve;
            }),
            readGate = new Promise<void>((resolve) => {
              releaseRead = resolve;
            }),
            sendGate = new Promise<void>((resolve) => {
              sent = resolve;
            });
          let firstRead = true;
          const winner = {
            ...updates,
            get: async () => {
              if (firstRead) {
                firstRead = false;
                firstStarted();
                await readGate;
              }
              return structuredClone(currentSubscription);
            },
            update: async (...args: Parameters<typeof updates.update>) => {
              const result = await updates.update(...args);
              sent();
              await Bun.sleep(30);
              return result;
            },
          };
          const firstChange = changeSubscription(
            f.actor,
            downAccept,
            async () => winner,
          );
          await firstReady;
          const competing = changeSubscription(
            f.actor,
            downAccept,
            async () => ({
              ...updates,
              get: async () => {
                secondStarted();
                await sendGate;
                throw Error("Synthetic competing reader failure");
              },
            }),
          ).then(
            (value) => ({ value, error: null }),
            (error) => ({ value: null, error }),
          );
          await secondReady;
          releaseRead();
          expect((await firstChange).state).toBe("scheduled");
          expect((await competing).error).toBeDefined();
          expect(writes).toBe(2);
          expect(
            (
              await f.owner.query(
                "SELECT status FROM webdock_auth.billing_change WHERE operation_id=$1",
                [downQuote.operationID],
              )
            ).rows[0].status,
          ).toBe("scheduled");
          await reconcileCustomer(environment, f.customer, provider);
          expect(
            (
              await f.owner.query(
                "SELECT revision FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
                [f.customer],
              )
            ).rows[0].revision,
          ).toBe(3);
          await Bun.sleep(Math.max(0, periodEnd.getTime() - Date.now() + 30));
          currentSubscription.current_period_start = periodEnd.toISOString();
          currentSubscription.current_period_end = new Date(
            periodEnd.getTime() + 365 * 86400000,
          ).toISOString();
          currentSubscription.product_id = down.polarProduct;
          currentSubscription.product = {
            id: down.polarProduct,
            organization_id: f.organization,
          };
          currentSubscription.prices = [down.price];
          currentSubscription.amount = down.amount;
          currentSubscription.pending_update = null;
          remote.orders.push({
            id: randomUUID(),
            customer_id: polarCustomer,
            product_id: down.polarProduct,
            subscription_id: subscriptionID,
            checkout_id: null,
            status: "paid",
            paid: true,
            billing_reason: "subscription_cycle",
            net_amount: 4941,
            tax_amount: 939,
            total_amount: 5880,
            discount_amount: 0,
            currency: "eur",
            refunded_amount: 0,
            refunded_tax_amount: 0,
          });
          await reconcileCustomer(environment, f.customer, provider);
          const downgraded = (
            await f.owner.query(
              "SELECT base,extras,revision FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
              [f.customer],
            )
          ).rows[0];
          expect(downgraded.base.storageBytes).toBe(500000000);
          expect(downgraded.revision).toBe(4);
          expect(downgraded.extras).toEqual(extras);
          applied.base = downgraded.base;
          applied.revision = downgraded.revision;
          await f.owner.query(
            `UPDATE webdock_auth."user" SET role='operator',"twoFactorEnabled"=true WHERE id=$1`,
            [f.actor.subject],
          );
          const quota = (
            await f.owner.query(
              "SELECT * FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
              [f.customer],
            )
          ).rows[0];
          await expect(
            withDatabaseScope({ kind: "session", ...f.actor }, () =>
              databasePools.business.query(
                "UPDATE webdock_auth.tenant_subscription SET base='{}' WHERE customer_id=$1",
                [f.customer],
              ),
            ),
          ).rejects.toHaveProperty("code", "55000");
          extras.storageBytes = 300;
          await withDatabaseScope({ kind: "session", ...f.actor }, () =>
            databasePools.business.query(
              "INSERT INTO webdock_auth.tenant_subscription(customer_id,plan_id,name,description,base,extras,revision,updated_by) VALUES($1,NULL,$2,$3,$4,$5,$6,$7) ON CONFLICT(customer_id) DO UPDATE SET base=EXCLUDED.base,extras=EXCLUDED.extras,revision=EXCLUDED.revision,updated_by=EXCLUDED.updated_by",
              [
                f.customer,
                quota.name,
                quota.description,
                JSON.stringify(quota.base),
                JSON.stringify(extras),
                quota.revision + 1,
                f.actor.subject,
              ],
            ),
          );
          applied.revision = quota.revision + 1;
          await f.owner.query(
            `UPDATE webdock_auth."user" SET role='user',"twoFactorEnabled"=false WHERE id=$1`,
            [f.actor.subject],
          );
          expect(
            (
              await f.owner.query(
                "SELECT count(*)::int AS n FROM webdock_auth.billing_subscription WHERE customer_id=$1",
                [f.customer],
              )
            ).rows[0].n,
          ).toBe(1);
        }
        let release!: () => void, started!: () => void;
        const pause = new Promise<void>((resolve) => {
            release = resolve;
          }),
          began = new Promise<void>((resolve) => {
            started = resolve;
          });
        const old = structuredClone(remote);
        old.subscriptions[0].status = "canceled";
        const slow = reconcileCustomer(environment, f.customer, async () => ({
          organizationID: f.organization,
          read: async () => {
            started();
            await pause;
            return old;
          },
        }));
        await began;
        await reconcileCustomer(environment, f.customer, provider);
        release();
        expect((await slow).applied).toBe(false);
        expect(
          (
            await f.owner.query(
              "SELECT service_status FROM webdock_auth.billing_contract WHERE customer_id=$1",
              [f.customer],
            )
          ).rows[0].service_status,
        ).toBe("active");
        await expect(
          reconcileCustomer(environment, f.customer, async () => ({
            organizationID: f.organization,
            read: async () => {
              throw Error("Synthetic provider outage");
            },
          })),
        ).rejects.toThrow();
        expect(
          (
            await f.owner.query(
              "SELECT service_status FROM webdock_auth.billing_contract WHERE customer_id=$1",
              [f.customer],
            )
          ).rows[0].service_status,
        ).toBe("active");
        currentSubscription.status = "past_due";
        await reconcileCustomer(environment, f.customer, provider);
        expect(
          (
            await f.owner.query(
              "SELECT service_status FROM webdock_auth.billing_contract WHERE customer_id=$1",
              [f.customer],
            )
          ).rows[0].service_status,
        ).toBe("warning");
        const pendingOnCancellation = (
          await f.owner.query(
            `INSERT INTO webdock_auth.billing_change(environment,customer_id,contract_id,subscription_id,version_id,operation_id,from_product_id,direction,snapshot,terms_hash,period_end,status,accepted_by) SELECT c.environment,c.customer_id,c.id,s.id,c.version_id,$2,s.polar_product_id,'downgrade',c.snapshot,c.terms_hash,now()+interval '1 month','scheduled',c.accepted_by FROM webdock_auth.billing_contract c JOIN webdock_auth.billing_subscription s ON s.contract_id=c.id WHERE c.customer_id=$1 RETURNING id`,
            [f.customer, randomUUID()],
          )
        ).rows[0].id;
        currentSubscription.status = "canceled";
        await reconcileCustomer(environment, f.customer, provider);
        expect(
          (
            await f.owner.query(
              "SELECT service_status FROM webdock_auth.billing_contract WHERE customer_id=$1",
              [f.customer],
            )
          ).rows[0].service_status,
        ).toBe("ended");
        await reconcileCustomer(environment, f.customer, provider);
        expect(
          (
            await f.owner.query(
              "SELECT state FROM webdock_auth.billing_contract WHERE customer_id=$1",
              [f.customer],
            )
          ).rows[0].state,
        ).toBe("ended");
        expect(
          (
            await f.owner.query(
              "SELECT status,error_code FROM webdock_auth.billing_change WHERE id=$1",
              [pendingOnCancellation],
            )
          ).rows[0],
        ).toEqual({ status: "failed", error_code: "subscription_ended" });
        const oldContract = (
          await f.owner.query(
            "SELECT id FROM webdock_auth.billing_contract WHERE customer_id=$1",
            [f.customer],
          )
        ).rows[0].id;
        const replacement = (
          await f.owner.query(
            `INSERT INTO webdock_auth.billing_contract(environment,customer_id,version_id,organization_id,binding_id,project_id,snapshot,terms_hash,accepted_by,previous_base) SELECT environment,customer_id,version_id,organization_id,binding_id,project_id,snapshot||jsonb_build_object('subscriptionRevision',(SELECT revision FROM webdock_auth.tenant_subscription WHERE customer_id=billing_contract.customer_id)),terms_hash,accepted_by,(SELECT jsonb_build_object('base',base) FROM webdock_auth.tenant_subscription WHERE customer_id=billing_contract.customer_id) FROM webdock_auth.billing_contract WHERE id=$1 RETURNING id`,
            [oldContract],
          )
        ).rows[0].id;
        const replacementCheckout = randomUUID(),
          replacementOperation = randomUUID(),
          replacementSubscription = randomUUID(),
          lateOrder = randomUUID(),
          replacementOrder = randomUUID();
        const replacementAttempt = (
          await f.owner.query(
            `INSERT INTO webdock_auth.billing_checkout(environment,customer_id,contract_id,operation_id,polar_checkout_id,expected_product_id,expected_customer_id,amount,currency,state) SELECT environment,customer_id,$2,$3,$4,expected_product_id,expected_customer_id,amount,currency,'open' FROM webdock_auth.billing_checkout WHERE contract_id=$1 RETURNING id`,
            [
              oldContract,
              replacement,
              replacementOperation,
              replacementCheckout,
            ],
          )
        ).rows[0].id;
        const secondCheckout = {
          ...structuredClone(checkout!),
          id: replacementCheckout,
          success_url: String(checkout!.success_url).includes(
            "/api/billing/return?",
          )
            ? String(checkout!.success_url).replace(
                /attemptID=[^&]+/,
                "attemptID=" + replacementAttempt,
              )
            : String(checkout!.return_url) + "?attempt=" + replacementAttempt,
          metadata: {
            webdock_contract_id: replacement,
            webdock_operation_id: replacementOperation,
          },
        };
        remote.checkouts.push(secondCheckout);
        currentSubscription.status = "active";
        const secondSubscription = {
          ...structuredClone(currentSubscription),
          id: replacementSubscription,
          checkout_id: replacementCheckout,
          product_id: f.polarProduct,
          product: { id: f.polarProduct, organization_id: f.organization },
          amount: 5880,
          prices: [
            {
              id: f.price,
              product_id: f.polarProduct,
              amount_type: "fixed",
              price_amount: 5880,
              price_currency: "eur",
              tax_behavior: "inclusive",
            },
          ],
          metadata: {},
        };
        remote.subscriptions.push(secondSubscription);
        remote.orders.push(
          {
            ...structuredClone(remote.orders[0]),
            id: lateOrder,
            status: "paid",
            refunded_amount: 0,
            refunded_tax_amount: 0,
          },
          {
            ...structuredClone(remote.orders[0]),
            id: replacementOrder,
            subscription_id: replacementSubscription,
            checkout_id: replacementCheckout,
            status: "paid",
            refunded_amount: 0,
            refunded_tax_amount: 0,
          },
        );
        await reconcileCustomer(environment, f.customer, provider);
        expect(
          (
            await f.owner.query(
              "SELECT state FROM webdock_auth.billing_contract WHERE id=$1",
              [oldContract],
            )
          ).rows[0].state,
        ).toBe("paid_needs_review");
        expect(
          (
            await f.owner.query(
              "SELECT state FROM webdock_auth.billing_contract WHERE id=$1",
              [replacement],
            )
          ).rows[0].state,
        ).toBe("active");
        expect(
          Number(
            (
              await f.owner.query(
                "SELECT count(*) AS n FROM webdock_auth.billing_order WHERE polar_order_id=ANY($1::uuid[])",
                [[lateOrder, replacementOrder]],
              )
            ).rows[0].n,
          ),
        ).toBe(2);
        expect(
          (
            await f.owner.query(
              "SELECT state FROM webdock_auth.billing_checkout WHERE contract_id=$1",
              [oldContract],
            )
          ).rows[0].state,
        ).toBe("paid_needs_review");
        // Remove only the added local replacement fixture before the existing manual-release assertions.
        const cleanupReplacement = await f.owner.connect();
        try {
          await cleanupReplacement.query(
            "BEGIN; SET LOCAL session_replication_role='replica'",
          );
          for (const table of [
            "billing_order",
            "billing_subscription",
            "billing_checkout",
          ])
            await cleanupReplacement.query(
              `DELETE FROM webdock_auth.${table} WHERE contract_id=$1`,
              [replacement],
            );
          await cleanupReplacement.query(
            "DELETE FROM webdock_auth.billing_contract WHERE id=$1",
            [replacement],
          );
          await cleanupReplacement.query("COMMIT");
        } finally {
          cleanupReplacement.release();
        }
        remote.checkouts.pop();
        remote.subscriptions.pop();
        remote.orders.pop();
        currentSubscription.status = "canceled";
        await f.owner.query(
          "UPDATE webdock_auth.billing_contract SET state='ended' WHERE id=$1",
          [oldContract],
        );
        await reconcileCustomer(environment, f.customer, provider);
        const ended = (
          await f.owner.query(
            "SELECT base,revision FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
            [f.customer],
          )
        ).rows[0];
        expect(ended.base).toEqual(applied.base);
        expect(ended.revision).toBe(
          applied.revision + (environment === "live" ? 1 : 0),
        ); // Replacement changes the plan label exactly once.
        if (environment === "live") {
          await f.owner.query(
            "UPDATE webdock_auth.billing_connection SET enforcement_enabled=true WHERE environment='live'",
          );
          expect(
            (
              await databasePools.authentication.query(
                "SELECT webdock_rls.billing_cms_allowed($1) AS allowed",
                [f.binding],
              )
            ).rows[0].allowed,
          ).toBe(false);
          const contract = (
            await f.owner.query(
              "SELECT id FROM webdock_auth.billing_contract WHERE customer_id=$1",
              [f.customer],
            )
          ).rows[0];
          await f.owner.query(
            `UPDATE webdock_auth."user" SET role='operator',"twoFactorEnabled"=true WHERE id=$1`,
            [f.actor.subject],
          );
          const { releaseToManual } =
            await import("../src/modules/billing/manual");
          await releaseToManual(
            f.actor,
            {
              customerID: f.customer,
              contractID: contract.id,
              revision: ended.revision,
              confirmName: "Buyer",
              reason: "Explicit fixture manual management",
            },
            async () => ({
              id: subscriptionID,
              customerID: polarCustomer,
              organizationID: f.organization,
              closed: true,
              outstanding: false,
            }),
          );
          expect(
            (
              await databasePools.authentication.query(
                "SELECT webdock_rls.billing_cms_allowed($1) AS allowed",
                [f.binding],
              )
            ).rows[0].allowed,
          ).toBe(true);
          expect(
            (
              await f.owner.query(
                "SELECT base FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
                [f.customer],
              )
            ).rows[0].base,
          ).toEqual(ended.base);
          const manual = { ...previous, storageBytes: 42 };
          await withDatabaseScope({ kind: "session", ...f.actor }, () =>
            databasePools.business.query(
              "UPDATE webdock_auth.tenant_subscription SET base=$2,revision=revision+1 WHERE customer_id=$1",
              [f.customer, JSON.stringify(manual)],
            ),
          );
          await reconcileCustomer(environment, f.customer, provider);
          expect(
            (
              await f.owner.query(
                "SELECT base FROM webdock_auth.tenant_subscription WHERE customer_id=$1",
                [f.customer],
              )
            ).rows[0].base,
          ).toEqual(manual);
          await f.owner.query(
            "UPDATE webdock_auth.billing_connection SET enforcement_enabled=false WHERE environment='live'",
          );
          expect(
            (
              await databasePools.authentication.query(
                "SELECT webdock_rls.billing_cms_allowed($1) AS allowed",
                [f.binding],
              )
            ).rows[0].allowed,
          ).toBe(true);
        } else
          await expect(
            withDatabaseScope(
              {
                kind: "system",
                purpose: "polar:sandbox:customer",
                customerID: f.customer,
              },
              () =>
                databasePools.worker.query(
                  "SELECT webdock_rls.project_billing_contract($1,$2)",
                  [f.customer, "1"],
                ),
            ),
          ).rejects.toHaveProperty("code", "42501");
      } finally {
        await f.cleanup();
      }
    },
  );
