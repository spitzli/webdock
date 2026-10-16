import { createBillingCrypto } from "@webdock/module-billing/server/crypto";

export const { sealBilling, openBilling } = createBillingCrypto({
  encryptionRoot: () => process.env.BETTER_AUTH_SECRET,
});
