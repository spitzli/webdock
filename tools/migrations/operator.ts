/** Offline initial operator + Console client bootstrap. Never imported by application startup. */
import {
  operatorConfig,
  operatorInput,
  readPrivateInput,
  OperatorSetupError,
} from "./operator-config";
import { runOfflineOperator } from "./operator-offline";
try {
  const [target, inputPath, destination, ...extra] = process.argv.slice(2);
  if (!inputPath || !destination || extra.length)
    throw new OperatorSetupError(
      "Usage: operator.ts host:port/database private-input.json new-private-output.json",
    );
  const config = operatorConfig(process.env, target);
  const input = operatorInput(
    await readPrivateInput(inputPath),
    process.env,
    config.local,
  );
  console.log(
    JSON.stringify(await runOfflineOperator(config, input, destination)),
  );
} catch (error) {
  console.error(
    error instanceof OperatorSetupError
      ? error.message
      : "Initial operator setup failed; no changes committed",
  );
  process.exitCode = 1;
}
