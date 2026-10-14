CREATE UNIQUE INDEX IF NOT EXISTS projects_customer_identity ON webdock_admin.projects(id,customer_id);
ALTER TABLE webdock_auth.hosting_setup ADD CONSTRAINT hosting_setup_project_customer_fk FOREIGN KEY(project_id,customer_id) REFERENCES webdock_admin.projects(id,customer_id);
