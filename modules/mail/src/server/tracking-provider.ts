export type TrackingTool = {
  id: string;
  forced: boolean | null;
  enabled: boolean;
  settings: { key: string; value: boolean | string | number }[];
};
export type TrackingDomain = {
  id: string;
  domain_name: string;
  verification_domain: string;
  verified: boolean;
  ssl: boolean;
  enabled: boolean;
  default: boolean;
};
export type TrackingInfo = {
  all_domains_disabled: boolean;
  match_sender: boolean;
  no_default_domain: boolean;
};
export type TrackingSettings = {
  click: TrackingTool;
  opening: TrackingTool;
  info: TrackingInfo;
  custom: boolean | null;
};
export interface MailTrackingProvider {
  settings(): Promise<TrackingSettings>;
  list(): Promise<TrackingDomain[]>;
  get(value: string): Promise<TrackingDomain>;
  create(senderDomain: string, fullHostname: string): Promise<string>;
  verify(value: string): Promise<void>;
  remove(value: string): Promise<void>;
  domainSetting(
    value: string,
    setting: "enabled" | "default",
    enabled: boolean,
  ): Promise<void>;
  setting(
    setting: "click" | "opening" | "custom" | "matchSender",
    enabled: boolean,
  ): Promise<void>;
}
export type MailTrackingFactory = (
  auth: string | { consumerKey: string; consumerSecret: string },
  fetcher?: import("./provider-ports").MailFetch,
) => MailTrackingProvider;
