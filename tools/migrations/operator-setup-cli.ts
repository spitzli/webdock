/** Run with Bun --no-env-file so offline credentials are always explicit. */
import { OperatorSetupError } from "./operator-config";
import { startOperatorSetup } from "./operator-setup";

try {
  const [target, destination, ttl = "600", ...extra] = process.argv.slice(2);
  if (
    !target ||
    !destination ||
    extra.length ||
    !/^\d+$/.test(ttl) ||
    Number(ttl) < 60 ||
    Number(ttl) > 900
  )
    throw new OperatorSetupError(
      "Usage: setup:admin host:port/database new-private-output.json [expiry-seconds:60–900]",
    );
  const session = await startOperatorSetup({
    env: process.env,
    target,
    destination,
    ttlMs: Number(ttl) * 1000,
    diagnostic: (message) => console.error(message),
  });
  const stop = () => {
    void session.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(
    "Open this private local setup link in your browser (do not share or record it):",
  );
  console.log(session.url + "/#" + session.capability);
  console.log(
    `This session expires in ${ttl} seconds. Credentials are written only to your selected private output file.`,
  );
  const outcome = await session.closed;
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  if (outcome.status === "success") {
    console.log(JSON.stringify(outcome.summary));
    console.log(
      "Setup stopped. Retain the private output, configure services, sign in at Auth, change the temporary password and enable an authenticator.",
    );
  } else {
    console.error(
      outcome.status === "uncertain"
        ? "Setup stopped after an uncertain commit. Retain the private output and inspect its recorded IDs before retrying."
        : "Setup session stopped or expired. Check any existing private output before starting another session.",
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    error instanceof OperatorSetupError
      ? error.message
      : "Could not start private local operator setup",
  );
  process.exitCode = 1;
}
