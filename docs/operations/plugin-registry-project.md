# Webdock plugin registry project

The owner requested a project for the registry on 2026-10-16. It was created through the authenticated Console in the **Webdock** workspace, separately from **Webdock Plattform**.

- Workspace: `103216044377636864` (Webdock).
- Project: `104618288083894272` (Webdock Plugin Registry).
- Console: <https://console.webdock.dev/hosting/projects/104618288083894272/overview>.
- Source repository recorded: <https://github.com/TabularisDB/tabularium>.

The saved project was read back in the Console. No hosting is assigned and no application or connected service exists yet. No domain, registry signing key, trust root or registry deployment has been configured. The project is the organizational destination for the future Tabularium registry, not evidence of a working registry or OCI image store.

Use separate deployment configuration and registry credentials for this project. Keep the plugin runtime installer independent of its registry being online: installed verified release bytes and image identities remain in Webdock. The registry kind/schema and signed release round-trip still require the runtime plan's Core Task 5 verification.
