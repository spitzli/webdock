/** Offline initial operator + Console client bootstrap. Never imported by application startup. */
import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { Pool } from "pg";
import { verifiedPostgresConfig } from "@webdock/database-runtime";
import {
  operatorConfig,
  operatorInput,
  readPrivateInput,
  OperatorSetupError,
} from "./operator-config";
import { provisionInitialOperator } from "./operator-provision";
let pool: Pool | undefined,
  output: Awaited<ReturnType<typeof open>> | undefined,
  outputPath: string | undefined,
  commitStarted = false;
try {
  const [target, inputPath, destination, ...extra] = process.argv.slice(2);
  if (!inputPath || !destination || extra.length)
    throw new OperatorSetupError(
      "Usage: operator.ts host:port/database private-input.json new-private-output.json",
    );
  const config = operatorConfig(process.env, target),
    input = operatorInput(
      await readPrivateInput(inputPath),
      process.env,
      config.local,
    );
  // Exclusive create refuses overwriting secrets or following an existing symlink.
  output = await open(
    destination,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  outputPath = destination;
  pool = new Pool({
    ...(config.local
      ? { connectionString: config.url.href }
      : verifiedPostgresConfig(config.url.href, config.ca)),
    max: 1,
  });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    if (
      (await db.query("SELECT current_database() AS name")).rows[0].name !==
      decodeURIComponent(config.url.pathname.slice(1))
    )
      throw new OperatorSetupError(
        "Connected database differs from explicit target",
      );
    const result = await provisionInitialOperator(db, input);
    await output.writeFile(
      JSON.stringify({ status: "verify-command-result", ...result }, null, 2) +
        "\n",
    );
    await output.sync();
    commitStarted = true;
    await db.query("COMMIT");
    console.log(
      JSON.stringify({
        created: true,
        operatorID: result.operatorID,
        clientID: result.clientID,
        checksum: result.checksum,
        securitySetupRequired: true,
      }),
    );
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
} catch (error) {
  // Never emit SQL diagnostics, parameter values, URLs or filesystem contents.
  console.error(
    error instanceof OperatorSetupError
      ? error.message
      : commitStarted
        ? "Initial setup commit could not be confirmed; retain the private output and inspect the recorded IDs before retrying"
        : "Initial operator setup failed; no changes committed",
  );
  process.exitCode = 1;
} finally {
  await output?.close();
  await pool?.end();
  if (process.exitCode && outputPath && !commitStarted)
    await unlink(outputPath).catch(() => {});
}
