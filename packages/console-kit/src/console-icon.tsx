import * as React from "react";
export type ConsoleIconName =
  | "overview"
  | "apps"
  | "database"
  | "mail"
  | "website"
  | "team"
  | "billing"
  | "settings"
  | "search"
  | "menu"
  | "close"
  | "chevron"
  | "code";
const paths: Record<ConsoleIconName, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  apps: "M4 4h16v16H4z M4 9h16 M9 9v11",
  database:
    "M4 6c0-4 16-4 16 0s-16 4-16 0 M4 6v12c0 4 16 4 16 0V6 M4 12c0 4 16 4 16 0",
  mail: "M3 5h18v14H3z M3 5l9 8 9-8",
  website:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18 M12 3c-5 5-5 13 0 18",
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M18 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4",
  billing: "M3 5h18v14H3z M3 10h18 M7 15h3",
  settings: "M4 7h8 M16 7h4 M4 17h4 M12 17h8 M12 4v6 M8 14v6",
  search: "M15 15l6 6 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  close: "M6 6l12 12 M6 18L18 6",
  chevron: "M8 10l4 4 4-4",
  code: "M8 5l-6 7 6 7 M16 5l6 7-6 7 M14 3l-4 18",
};
export function ConsoleIcon({ name }: { name: ConsoleIconName }) {
  return (
    <svg
      className="console-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
