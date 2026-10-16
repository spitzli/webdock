import test from "node:test";
import assert from "node:assert/strict";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { I18nProvider } from "@webdock/i18n/react";
import { translator } from "@webdock/i18n";
import { PrivateOfferForm } from "@webdock/module-billing/ui/catalog-forms";
import { OperatorBillingPage } from "@webdock/module-billing/ui/operator-page";
import { billingFormKey } from "@webdock/module-billing/ui/state";

test("operator Billing presentation preserves customer/environment and manual-release conditions", () => {
  const view = {
    customer: { id: "123", name: "Customer A", revision: 7 },
    agreements: [
      {
        id: "456",
        state: "ended",
        serviceStatus: "ended",
        manualReleaseID: null,
        snapshot: {
          versionID: "1",
          productID: "product",
          priceIDs: ["price"],
          name: "Plan",
          description: "Terms",
          terms: "Agreed terms",
          amount: "1200",
          currency: "EUR" as const,
          taxBehavior: "inclusive" as const,
          interval: "year" as const,
          entitlements: {
            websites: 1 as const,
            editors: 2,
            mediaBytes: "100",
            mailMonthly: 10,
          },
          termsHash: "hash",
        },
      },
    ],
  };
  const props = {
    id: "123",
    environment: "live" as const,
    i18n: translator("en"),
    view,
    billingLabel: (value: string) => value,
    Link: ({ href, children }: { href: string; children?: React.ReactNode }) =>
      h("a", { href }, children),
    forms: {
      ManualReleaseForm: ({ customerID }: { customerID: string }) =>
        h("form", { "data-release-customer": customerID }),
      RefreshBilling: ({
        customerID,
        environment,
      }: {
        customerID: string;
        environment: string;
      }) => h("form", { "data-refresh": customerID + ":" + environment }),
    },
  };
  const live = renderToStaticMarkup(h(OperatorBillingPage, props));
  assert.match(live, /Customer A/);
  assert.match(live, /data-release-customer="123"/);
  assert.match(live, /data-refresh="123:live"/);
  assert.doesNotMatch(
    renderToStaticMarkup(
      h(OperatorBillingPage, { ...props, environment: "sandbox" }),
    ),
    /data-release-customer/,
  );
});
test("private offer result clears on customer and environment changes", async () => {
  const window = new Window();
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    FormData: globalThis.FormData,
  };
  Object.assign(globalThis, {
    window,
    document: window.document,
    FormData: window.FormData,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const actionPorts = {
    privateOfferAction: async (
      _environment: string,
      _version: string,
      _state: {},
      form: FormData,
    ) => ({
      url: "https://console.example/offers/" + String(form.get("customerID")),
      success: "Created",
    }),
  };
  const render = (environment: string) =>
    h(
      I18nProvider,
      { locale: "en", preference: "en" },
      h(PrivateOfferForm, {
        key: billingFormKey(environment, "version"),
        environment,
        versionID: "version",
        customers: [
          { id: "123", name: "A" },
          { id: "234", name: "B" },
        ],
        actionPorts,
      }),
    );
  try {
    await act(async () => root.render(render("sandbox")));
    await act(async () => {
      const select = container.querySelector("select")!;
      select.value = "123";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    assert.match(container.textContent, /offers\/123/);
    await act(async () => {
      const select = container.querySelector("select")!;
      select.value = "234";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.doesNotMatch(container.textContent, /offers\/123/);
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    assert.match(container.textContent, /offers\/234/);
    await act(async () => root.render(render("live")));
    assert.doesNotMatch(container.textContent, /offers\/234/);
  } finally {
    await act(async () => root.unmount());
    await window.happyDOM.close();
    Object.assign(globalThis, {
      window: previous.window,
      document: previous.document,
      FormData: previous.FormData,
    });
    if (previous.navigator)
      Object.defineProperty(globalThis, "navigator", previous.navigator);
  }
});
