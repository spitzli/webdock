// Independent recorded profiles keep account tests from deleting another fixture's grants.
const name = process.env.WEBDOCK_ACCOUNT_FIXTURE ?? "account-browser.json";
if (
  name.length > 96 ||
  !/^account-browser[A-Za-z0-9._-]*\.json$/.test(name) ||
  name.includes("..")
) {
  throw new Error("Use an owned account-browser fixture filename.");
}
export const accountFixture = new URL(`../../../.runtime-test/${name}`, import.meta.url);
export const accountCookies = new URL(
  `../../../.runtime-test/${name.replace(/\.json$/, "-cookies.json")}`,
  import.meta.url,
);
