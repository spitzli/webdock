import * as migration_20261018_180000_cms_bridge from './20261018_180000_cms_bridge';
import * as migration_20261003_110019_instance_initial from './20261003_110019_instance_initial';
import * as migration_20261003_133003_sso_subject from './20261003_133003_sso_subject';

export const migrations = [
  {
    up: migration_20261003_110019_instance_initial.up,
    down: migration_20261003_110019_instance_initial.down,
    name: '20261003_110019_instance_initial',
  },
  {
    up: migration_20261003_133003_sso_subject.up,
    down: migration_20261003_133003_sso_subject.down,
    name: '20261003_133003_sso_subject'
  },
  {
    up: migration_20261018_180000_cms_bridge.up,
    down: migration_20261018_180000_cms_bridge.down,
    name: '20261018_180000_cms_bridge',
  },
];
