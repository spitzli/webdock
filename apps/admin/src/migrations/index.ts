import * as migration_20261003_124635_initial from "./20261003_124635_initial";

export const migrations = [
  {
    up: migration_20261003_124635_initial.up,
    down: migration_20261003_124635_initial.down,
    name: "20261003_124635_initial",
  },
];
