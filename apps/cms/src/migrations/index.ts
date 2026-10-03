import * as migration_20261003_072310_initial from './20261003_072310_initial';
import * as migration_20261003_072452_api_keys from './20261003_072452_api_keys';
import * as migration_20261003_075352_member_role from './20261003_075352_member_role';
import * as migration_20261003_075353_unified_sites from './20261003_075353_unified_sites';
import * as migration_20261003_075923_languages_and_forms from './20261003_075923_languages_and_forms';

export const migrations = [
  {
    up: migration_20261003_072310_initial.up,
    down: migration_20261003_072310_initial.down,
    name: '20261003_072310_initial',
  },
  {
    up: migration_20261003_072452_api_keys.up,
    down: migration_20261003_072452_api_keys.down,
    name: '20261003_072452_api_keys',
  },
  {
    up: migration_20261003_075352_member_role.up,
    down: migration_20261003_075352_member_role.down,
    name: '20261003_075352_member_role',
  },
  {
    up: migration_20261003_075353_unified_sites.up,
    down: migration_20261003_075353_unified_sites.down,
    name: '20261003_075353_unified_sites',
  },
  {
    up: migration_20261003_075923_languages_and_forms.up,
    down: migration_20261003_075923_languages_and_forms.down,
    name: '20261003_075923_languages_and_forms'
  },
];
