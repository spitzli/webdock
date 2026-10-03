import * as migration_20261003_110019_instance_initial from './20261003_110019_instance_initial';

export const migrations = [
  {
    up: migration_20261003_110019_instance_initial.up,
    down: migration_20261003_110019_instance_initial.down,
    name: '20261003_110019_instance_initial'
  },
];
