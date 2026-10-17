const text = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 32768;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length <= 30;
const number = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) > 0;
export const mailStudioShapes: Record<string, ((value: unknown) => boolean)[]> =
  {
    mailConnections: [text],
    mailOnboarding: [text],
    mailConnectByok: [text, object],
    mailConfigureManaged: [text],
    mailRotateManaged: [text, text],
    mailOverview: [text, text],
    mailHealth: [text, text],
    mailTracking: [text, text],
    mailTrackingUpdate: [text, text, object],
    mailMessages: [text, text, object],
    mailMessage: [text, text, text],
    mailContent: [text, text, text],
    mailTestSend: [text, text, object],
    mailReschedule: [text, text, text, text, number],
    mailCancel: [text, text, text, number],
    mailDomains: [text, text, object],
    mailDomain: [text, text, text],
    mailDomainCreate: [text, text, text],
    mailDomainVerify: [text, text, text],
    mailDomainRemove: [text, text, text],
    mailKeys: [text, text, object],
    mailKeyCreate: [text, text, object],
    mailKeyRevoke: [text, text, text],
    mailAnalytics: [text, text, object],
    mailWebhooks: [text, text, object],
    mailWebhook: [text, text, text],
    mailWebhookCreate: [text, text, object],
    mailWebhookUpdate: [text, text, text, object],
    mailWebhookDelete: [text, text, text],
    mailWebhookRotate: [text, text, text],
    mailWebhookReplay: [text, text, text],
    mailWebhookDeliveries: [text, text, text, object],
    mailSuppressions: [text, text, object],
    mailSuppressionSet: [text, text, object],
    mailSuppressionRemove: [text, text, text],
    mailLogs: [text, text, object],
    mailLog: [text, text, text],
    mailConnectionUpdate: [text, text, object],
    mailReconcile: [text, text, text],
  };
