# Local development: PostgreSQL in Docker, native Core and Console as host processes.
# Start with `tilt up`; generated loopback credentials live in .dev-local/ (gitignored).
# Requires Docker, the pinned Rust toolchain and Node 24 on PATH. `tilt down` keeps the database volume;
# `docker compose -f deploy/dev/compose.yaml down -v` resets it.

local('node tools/dev/local.mjs secrets', quiet=True)

docker_compose('deploy/dev/compose.yaml', project_name='webdock-dev')
dc_resource('postgres', labels=['infra'])

local_resource(
    'core-build',
    cmd='cargo build -p webdock-control-plane --bins',
    deps=['crates', 'Cargo.toml', 'Cargo.lock', 'proto'],
    ignore=['**/target', 'crates/**/tests'],
    labels=['core'],
)

# Offline migrations and the one-time operator bootstrap; reruns when migrations change.
local_resource(
    'database',
    cmd='node tools/dev/local.mjs init',
    deps=['crates/persistence/migrations', 'crates/persistence/schema', 'tools/dev/local.mjs'],
    resource_deps=['postgres', 'core-build'],
    labels=['infra'],
)

local_resource(
    'core',
    serve_cmd='node tools/dev/local.mjs core',
    # Restarts after every successful rebuild of the binary.
    deps=['target/debug/webdock-control-plane'],
    resource_deps=['database'],
    readiness_probe=probe(http_get=http_get_action(port=3130, host='127.0.0.1', path='/readyz'), period_secs=2),
    links=[link('http://127.0.0.1:3130/healthz', 'healthz')],
    labels=['core'],
)

local_resource(
    'console',
    serve_cmd='npx vite --host 127.0.0.1 --port 3121 --strictPort',
    serve_dir='apps/console-ui',
    resource_deps=['core'],
    links=[link('http://127.0.0.1:3121', 'Console')],
    labels=['ui'],
)

# Password, MFA and passkey screens run on the canonical auth origin; WebAuthn needs `localhost`.
local_resource(
    'account',
    serve_cmd='npx vite --host localhost --port 3125 --strictPort',
    serve_dir='apps/console-ui',
    resource_deps=['core'],
    links=[link('http://localhost:3125/account', 'Account')],
    labels=['ui'],
)
