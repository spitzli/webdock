export const pluginProvisioningSchemaSQL = `
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_plugin_provisioning (
 id varchar PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 plugin_id text NOT NULL,customer_id varchar NOT NULL,project_id varchar NOT NULL,
 template_id text NOT NULL,name text NOT NULL,actor jsonb NOT NULL,
 plugin_generation integer NOT NULL,grant_revision integer NOT NULL,
 setup_id varchar UNIQUE REFERENCES webdock_auth.hosting_setup(id),
 binding jsonb,template_state jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(plugin_id,project_id,template_id),
 FOREIGN KEY(project_id,customer_id) REFERENCES webdock_admin.projects(id,customer_id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.hosting_plugin_provisioning_request (
 plugin_id text NOT NULL,customer_id varchar NOT NULL,project_id varchar NOT NULL,
 request_id text NOT NULL,request_hash text NOT NULL,provisioning_id varchar NOT NULL REFERENCES webdock_auth.hosting_plugin_provisioning(id),
 PRIMARY KEY(plugin_id,project_id,request_id),
 FOREIGN KEY(project_id,customer_id) REFERENCES webdock_admin.projects(id,customer_id)
);
`;
