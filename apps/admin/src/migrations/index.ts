import * as migration_20261003_124635_initial from './20261003_124635_initial';
import * as migration_20261003_133004_sso_subject from './20261003_133004_sso_subject';

export const migrations = [
  {
    up: migration_20261003_124635_initial.up,
    down: migration_20261003_124635_initial.down,
    name: '20261003_124635_initial',
  },
  {
    up: migration_20261003_133004_sso_subject.up,
    down: migration_20261003_133004_sso_subject.down,
    name: '20261003_133004_sso_subject'
  },
];
