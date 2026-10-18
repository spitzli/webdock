export const mailSendingPaths = [
  "/sending",
  "/emails",
  "/analytics",
  "/quickstart",
  "/api-keys",
  "/webhooks",
  "/suppressions",
  "/logs",
];
export type MailNavigationLink = {
  href: string;
  label: string;
  exact?: boolean;
  activePaths?: string[];
  nested?: boolean;
};
/** Pure contribution for the Console's resource navigation slot. No provider data is exposed. */
export function mailNavigation(
  customerID: string,
  canManage: boolean,
  pathname: string,
  connection: string | null,
): MailNavigationLink[] {
  const base = `/tenants/${encodeURIComponent(customerID)}/mail`;
  const sending = mailSendingPaths.some(
    (path) =>
      pathname === base + path || pathname.startsWith(base + path + "/"),
  );
  const pages = [
    { path: "/sending", label: "Overview", exact: true },
    { path: "/emails", label: "Messages" },
    { path: "/analytics", label: "Analytics" },
    { path: "/quickstart", label: "Quickstart" },
    ...(canManage
      ? [
          { path: "/api-keys", label: "API keys" },
          { path: "/webhooks", label: "Webhooks" },
          { path: "/suppressions", label: "Suppressions" },
          { path: "/logs", label: "Request logs" },
        ]
      : []),
  ];
  const href = (path: string) =>
    base +
    path +
    (connection ? "?connection=" + encodeURIComponent(connection) : "");
  const primary = [
    { path: "", label: "Overview", exact: true },
    {
      path: "/sending",
      label: "Sending",
      activePaths: mailSendingPaths.map((path) => base + path),
    },
    { path: "/mailboxes", label: "Mailboxes", activePaths: [base + "/inbox"] },
    { path: "/domains", label: "Sender domains" },
    ...(canManage
      ? [
          { path: "/keys", label: "Mail credentials" },
          { path: "/tracking", label: "Tracking" },
          { path: "/settings", label: "Settings" },
        ]
      : []),
  ];
  return primary.flatMap((page) => [
    {
      href: href(page.path),
      label: page.label,
      exact: page.exact || page.path === "/sending",
      activePaths:
        page.exact || page.path === "/sending"
          ? undefined
          : [base + page.path, ...(page.activePaths ?? [])],
    },
    ...(page.path === "/sending" && sending
      ? pages
          .filter((tool) => tool.path !== "/sending")
          .map((tool) => ({
            href: href(tool.path),
            label: tool.label,
            exact: tool.exact,
            activePaths: tool.exact ? undefined : [base + tool.path],
            nested: true,
          }))
      : []),
  ]);
}
