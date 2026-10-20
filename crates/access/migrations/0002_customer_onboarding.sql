-- Native0025 draft: how a customer's invited owners finish their profile.
-- Managed customers are prepared by an operator; self-service owners complete the profile after accepting.
ALTER TABLE webdock_admin.customers ADD COLUMN IF NOT EXISTS onboarding text NOT NULL DEFAULT 'managed' CHECK(onboarding IN ('managed','self-service'));
-- Invitees read the mode to choose their next step; only the operator registry changes it.
GRANT SELECT(onboarding) ON TABLE webdock_admin.customers TO webdock_policy_owner, webdock_auth_bootstrap, webdock_auth_runtime;
