# Kubernetes hosting adapter distribution

The actual Kubernetes adapter is the independently deployed Python agent in `agents/kubernetes`, identified by `runtime.json`. Managed execution uses the existing node-local daemon, ownership checks, leases, admission policy and retained-storage services. BYOK execution uses its separately scoped image/chart and never inherits managed provisioning privileges.

There is intentionally no API-side Kubernetes HTTP client or kubeconfig. The Webdock API sends authorized, fenced operations over the existing enrolled-agent protocol; node-local execution retains credentials. This descriptor does not install an agent or add a provisioning path. Source relocation without packaging all SSH-inline, systemd, archive and container entrypoints would break that distribution; those paths remain stable.
