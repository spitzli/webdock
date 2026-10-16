// A claimed setup may read only its stored identity while obtaining fresh provider proof.
export const setupClerkRevalidationSQL = String.raw`
CREATE OR REPLACE FUNCTION webdock_rls.setup_clerk_revalidation(issuer text, clerk_user text, clerk_session text, clerk_org text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,webdock_rls AS $$
 SELECT jsonb_build_object(
  'identity',jsonb_build_object('id',u.id,'name',u.name,'email',u.email,'role',u.role,'banned',u.banned,'emailVerified',u."emailVerified",'enabled',i.enabled),
  'organization',CASE WHEN o.organization_id IS NOT NULL THEN jsonb_build_object('id',o.organization_id,'customerID',s.customer_id,'active',c.status='active','enabled',o.enabled) ELSE NULL END)
 FROM webdock_auth.hosting_setup s
 JOIN webdock_admin.customers c ON c.id=s.customer_id
 JOIN webdock_admin.projects p ON p.id=s.project_id AND p.customer_id=s.customer_id
 JOIN webdock_auth.clerk_identity i ON i.issuer=s.actor->'consoleIdentity'->>'issuer' AND i.clerk_user_id=s.actor->'consoleIdentity'->>'userID' AND i.user_id=s.actor->>'subject'
 JOIN webdock_auth."user" u ON u.id=i.user_id
 JOIN webdock_auth.tenant_customer t ON t.customer_id=s.customer_id
 LEFT JOIN webdock_auth.clerk_organization o ON o.issuer=i.issuer AND o.clerk_organization_id=s.actor->'consoleIdentity'->>'organizationID' AND o.organization_id=t.organization_id
 WHERE webdock_rls.worker(ARRAY['hosting-setup-revalidation'])
 AND s.id=webdock_rls.request_scope()->>'setupID' AND s.customer_id=webdock_rls.request_scope()->>'customerID'
 AND s.generation::text=webdock_rls.request_scope()->>'generation'
 AND s.state='running' AND s.confirmed_preview_id IS NOT NULL AND s.lease_until>statement_timestamp()
 AND c.status='active' AND p.status='active'
 AND s.actor->'scopes' ? 'hosting:write' AND s.actor->'scopes' ? 'hosting:read'
 AND i.issuer=setup_clerk_revalidation.issuer AND i.clerk_user_id=clerk_user
 AND s.actor->'consoleIdentity'->>'sessionID'=clerk_session AND s.actor->>'sessionID'=clerk_session
 AND (s.actor->'consoleIdentity'->>'organizationID') IS NOT DISTINCT FROM clerk_org
 AND (clerk_org IS NULL OR o.organization_id IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM webdock_admin.project_deletion d WHERE d.project_id=s.project_id AND d.status<>'deleted')
$$;
ALTER FUNCTION webdock_rls.setup_clerk_revalidation(text,text,text,text) OWNER TO webdock_platform_owner;
REVOKE ALL ON FUNCTION webdock_rls.setup_clerk_revalidation(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webdock_rls.setup_clerk_revalidation(text,text,text,text) TO webdock_worker_runtime;
`;
