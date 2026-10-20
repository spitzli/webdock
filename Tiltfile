# Local development: PostgreSQL in Docker, native Core and Console as host processes.
# Start with `tilt up`; generated loopback credentials live in .dev-local/ (gitignored).
# Requires Docker, the pinned Rust toolchain and Node 24 on PATH. `tilt down` keeps the database volume;
# `docker compose -f deploy/dev/compose.yaml down -v` resets it.

local('node tools/dev/local.mjs secrets', quiet=True)

docker_compose('deploy/dev/compose.yaml', project_name='webdock-dev')
dc_resource('postgres', labels=['infra'])
dc_resource('registry', labels=['infra'], links=[link('http://127.0.0.1:5005/v2/_catalog', 'catalog')])

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

# Demo extension: image pushed to the local registry once, then recorded as an installed release.
local_resource(
    'echo-demo-image',
    cmd='node tools/dev/local.mjs plugin-image',
    resource_deps=['registry'],
    labels=['plugins'],
)

local_resource(
    'seed',
    cmd='node tools/dev/local.mjs seed',
    deps=['tools/dev/local.mjs', 'plugins/echo-demo/manifest.json'],
    resource_deps=['database', 'echo-demo-image'],
    labels=['infra'],
)

local_resource(
    'echo-demo-build',
    cmd='cargo build --manifest-path plugins/echo-demo/Cargo.toml',
    deps=['plugins/echo-demo/src', 'plugins/echo-demo/Cargo.toml', 'crates/plugin-runtime', 'crates/plugin-protocol'],
    labels=['plugins'],
)

local_resource(
    'plugin-control',
    serve_cmd="sh -c 'set -a && . .dev-local/runtime.env && set +a && rm -f .dev-local/plugins/control.sock && exec target/debug/webdock-plugin-control --config \"$PWD/.dev-local/plugins/plugin-config.json\"'",
    deps=['target/debug/webdock-plugin-control', '.dev-local/runtime.env'],
    resource_deps=['seed', 'core-build'],
    readiness_probe=probe(exec=exec_action(['test', '-S', '.dev-local/plugins/control.sock']), period_secs=1),
    labels=['plugins'],
)

local_resource(
    'plugin-controller',
    serve_cmd="sh -c 'set -a && . .dev-local/runtime.env && set +a && exec target/debug/webdock-plugin-controller --config \"$PWD/.dev-local/plugins/plugin-config.json\"'",
    deps=['target/debug/webdock-plugin-controller', '.dev-local/runtime.env'],
    resource_deps=['seed', 'core-build'],
    labels=['plugins'],
)

local_resource(
    'echo-demo',
    serve_cmd="sh -c 'rm -f .dev-local/plugins/echo-demo.sock && exec plugins/echo-demo/target/debug/webdock-echo-demo \"$PWD/.dev-local/plugins/echo-demo.json\"'",
    deps=['plugins/echo-demo/target/debug/webdock-echo-demo'],
    resource_deps=['plugin-control', 'echo-demo-build'],
    readiness_probe=probe(exec=exec_action(['test', '-S', '.dev-local/plugins/echo-demo.sock']), period_secs=1),
    labels=['plugins'],
)

local_resource(
    'core',
    serve_cmd="sh -c 'set -a && . .dev-local/runtime.env && set +a && exec target/debug/webdock-control-plane'",
    # Restarts after every successful rebuild of the binary.
    deps=['target/debug/webdock-control-plane', '.dev-local/runtime.env'],
    resource_deps=['seed'],
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
