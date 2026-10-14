export type BillingEnvironment = "sandbox" | "live";
export type BillingConnectionStatus = {
  apiVersion?: string;
  pendingJobs?: number;
  reviewJobs?: number;
  oldestDueAt?: string | null;
  environment: BillingEnvironment;
  revision: string;
  salesEnabled: boolean;
  catalogPublishEnabled: boolean;
  enforcementEnabled: boolean;
  organizationID: string | null;
  organizationName?: string | null;
  locked?: boolean;
  tokenSuffix: string | null;
  tokenVersion?: number;
  tokenExpiresAt?: string | null;
  endpointID?: string | null;
  webhookVersion?: number;
  previousWebhookUntil?: string | null;
  checkedAt?: string | null;
  receivedAt?: string | null;
  reconciledAt?: string | null;
  updatedAt?: string | null;
};
export type BillingProductVersion = {
  id: string;
  productID: string;
  sku: string;
  name: string;
  visibility: "public" | "private" | "internal";
  operationallyReady: boolean;
  version: number;
  amount: string;
  currency: "EUR" | "CHF";
  taxBehavior: "inclusive" | "exclusive";
  interval: "month" | "year";
  description: string;
  terms: string;
  entitlements: {
    websites: 1;
    editors: number;
    mediaBytes: string;
    mailMonthly: number;
  };
  termsHash: string;
  frozen: boolean;
  status: string | null;
  polarProductID: string | null;
  errorCode?: string | null;
};
export type PurchaseVersion = {
  versionID: string;
  productID: string;
  priceIDs: string[];
  name: string;
  description: string;
  terms: string;
  amount: string;
  currency: "EUR" | "CHF";
  taxBehavior: "inclusive" | "exclusive";
  interval: "month" | "year";
  entitlements: {
    websites: 1;
    editors: number;
    mediaBytes: string;
    mailMonthly: number;
  };
  termsHash: string;
};
export type PurchaseQuote = PurchaseVersion & {
  siteName: string;
  subscriptionRevision: number;
  status: string;
  canAccept: boolean;
};
export type BillingOfferView = {
  id: string;
  environment: BillingEnvironment;
  customerID: string;
  versionID: string;
  expiresAt: string;
  status: string;
  version: PurchaseVersion;
};
export type TenantBillingView = {
  changes: SubscriptionChangeView[];
  environment: BillingEnvironment;
  customerID: string;
  salesEnabled: boolean;
  canOpenPortal: boolean;
  catalog: PurchaseVersion[];
  sites: { bindingID: string; projectID: string; name: string }[];
  agreements: {
    id: string;
    versionID: string;
    state: string;
    serviceStatus: string;
    snapshot: PurchaseVersion;
    originalSnapshot: PurchaseVersion;
    projectID: string;
    bindingID: string;
    termsHash: string;
  }[];
  attempts: {
    id: string;
    contractID: string;
    state: string;
    expiresAt: string | null;
  }[];
  subscriptions: {
    id: string;
    contractID: string;
    status: string;
    amount: string;
    currency: string;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    initialOrderPaid: boolean;
    reconciledAt: string | null;
  }[];
  orders: {
    id: string;
    contractID: string;
    status: string;
    totalAmount: string;
    currency: string;
    refundedAmount: string;
    reconciledAt: string | null;
  }[];
};
export type SubscriptionChangeQuote = {
  current: PurchaseVersion;
  target: PurchaseVersion;
  direction: "upgrade" | "downgrade";
  periodEnd: string;
  termsHash: string;
  operationID: string;
};
export type SubscriptionChangeView = {
  id: string;
  contractID: string;
  subscriptionID: string;
  status: string;
  direction: "upgrade" | "downgrade";
  snapshot: PurchaseVersion;
  effectiveAt: string | null;
  acceptedAt: string;
  appliedAt: string | null;
};

export type BillingJobView = {
  id: string;
  kind: string;
  status: string;
  customerID: string | null;
  attempts: number;
  availableAt: string;
  errorCode: string | null;
};
