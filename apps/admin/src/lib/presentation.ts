export const relatedID = (value: string | { id: string }) =>
  typeof value === "string" ? value : value.id;
export const date = (value: string) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
export const hostname = (value?: string | null) => {
  try {
    return value ? new URL(value).hostname : "No domain yet";
  } catch {
    return "No domain yet";
  }
};
