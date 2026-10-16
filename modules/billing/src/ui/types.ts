import type { ComponentType, ReactNode } from "react";
export type BillingState = { error?: string; success?: string };
export type PaymentState = { error?: string; message?: string };
export type BillingAction<S = BillingState> = (
  state: S,
  form: FormData,
) => Promise<S>;
export type BillingFamilies = readonly (readonly [string, string])[];
export type BillingLink = ComponentType<{
  href: string;
  children?: ReactNode;
  className?: string;
  "aria-current"?: "page";
}>;
export interface BillingActionPorts {
  billingConnectionAction: BillingAction;
  billingSwitchesAction: BillingAction;
  billingEndpointAction: BillingAction;
  sandboxCustomerAction: BillingAction;
  retryBillingReadAction: BillingAction;
  manualReleaseAction: BillingAction;
  refreshBillingAction: BillingAction;
  purchaseAction: BillingAction<PaymentState>;
  subscriptionChangeAction: BillingAction<PaymentState>;
  resumeChangeAction: BillingAction<PaymentState>;
  paymentLinkAction: (
    operation: "billing.portal" | "billing.resume",
    state: PaymentState,
    form: FormData,
  ) => Promise<PaymentState>;
  createVersionAction: BillingAction;
  publishVersionAction: (
    environment: string,
    versionID: string,
    state: BillingState,
    form: FormData,
  ) => Promise<BillingState>;
  privateOfferAction: (
    environment: string,
    versionID: string,
    state: BillingState & { url?: string },
    form: FormData,
  ) => Promise<BillingState & { url?: string }>;
  availabilityAction: (
    productID: string,
    state: BillingState,
    form: FormData,
  ) => Promise<BillingState>;
  archiveVersionAction: (
    environment: string,
    versionID: string,
    state: BillingState,
    form: FormData,
  ) => Promise<BillingState>;
}
