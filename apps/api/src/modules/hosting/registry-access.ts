// Applied by the registry schema owner, never by a request handler.
// The Auth role may lock project rows without receiving cross-schema UPDATE rights.
export const hostingRegistryLockSQL = `
CREATE OR REPLACE FUNCTION webdock_admin.lock_hosting_project(p_project_id varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM id FROM webdock_admin.projects WHERE id=p_project_id FOR SHARE;
END;
$$;
REVOKE ALL ON FUNCTION webdock_admin.lock_hosting_project(varchar) FROM PUBLIC;
`;
export const hostingRegistryGrantsSQL = `
GRANT USAGE ON SCHEMA webdock_admin TO webdock_auth_runtime;
GRANT SELECT(id,name,customer_id,status,url), REFERENCES(id) ON webdock_admin.projects TO webdock_auth_runtime;
GRANT REFERENCES(id) ON webdock_admin.customers TO webdock_auth_runtime;
GRANT EXECUTE ON FUNCTION webdock_admin.lock_hosting_project(varchar) TO webdock_auth_runtime;
`;
