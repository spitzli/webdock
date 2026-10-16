// Inserted into actor() by the offline policy installer after Clerk schema migration.
export const clerkActorSQL = `
 IF s ? 'clerk' THEN
  IF jsonb_typeof(s->'clerk')<>'object' OR (s->'clerk'->>'expiresAt')::numeric<=extract(epoch FROM statement_timestamp())*1000
   OR (s->'clerk'->>'verifiedAt')::numeric>extract(epoch FROM statement_timestamp())*1000
   OR (s->'clerk'->>'verifiedAt')::numeric<extract(epoch FROM statement_timestamp())*1000-60000
   OR (s->'clerk'->>'expiresAt')::numeric>(s->'clerk'->>'verifiedAt')::numeric+60000
   OR s->'clerk'->>'expiresAt' IS NULL OR s->'clerk'->>'verifiedAt' IS NULL THEN RETURN NULL; END IF;
  SELECT u.id,u.email,u.role INTO actor_row FROM webdock_auth.clerk_identity i JOIN webdock_auth."user" u ON u.id=i.user_id
   WHERE i.issuer=s->'clerk'->>'issuer' AND i.clerk_user_id=s->'clerk'->>'userID' AND i.enabled AND u.id=s->>'subject'
   AND NOT coalesce(u.banned,false) AND u.role IN ('operator','user');
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF s->'clerk'->>'organizationID' IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM webdock_auth.clerk_organization o JOIN webdock_auth.tenant_customer t ON t.organization_id=o.organization_id JOIN webdock_admin.customers c ON c.id=t.customer_id
   WHERE o.issuer=s->'clerk'->>'issuer' AND o.clerk_organization_id=s->'clerk'->>'clerkOrganizationID' AND o.organization_id=s->'clerk'->>'organizationID'
   AND t.customer_id=s->'clerk'->>'customerID' AND o.enabled AND c.status='active' AND s->'clerk'->>'role' IN ('admin','member')) THEN RETURN NULL; END IF;
  SELECT p.session_id,p.actor_id,p.customer_id,p.organization_id,p.expires_at,p.expired_at,
   (p.expired_at IS NULL AND p.expires_at>statement_timestamp() AND c.status='active' AND t.organization_id=p.organization_id) AS valid INTO preview_row
   FROM webdock_auth.console_tenant_preview p LEFT JOIN webdock_admin.customers c ON c.id=p.customer_id LEFT JOIN webdock_auth.tenant_customer t ON t.customer_id=p.customer_id
   WHERE p.issuer=s->'clerk'->>'issuer' AND p.session_id=s->>'sessionID' AND p.actor_id=actor_row.id;
  RETURN jsonb_build_object('subject',actor_row.id,'email',actor_row.email,'sessionID',s->>'sessionID','operator',actor_row.role='operator' AND NOT FOUND,'root',actor_row.role='operator','clerk',s->'clerk','preview',CASE WHEN FOUND THEN to_jsonb(preview_row) ELSE NULL END);
 END IF;
`;
export const clerkCustomerSQL = `
 IF a ? 'clerk' THEN
  RETURN a->'clerk'->>'customerID'=customer AND a->'clerk'->>'role' IN ('admin','member') AND (NOT writing OR a->'clerk'->>'role'='admin');
 END IF;
`;

export const clerkSetupSQL = `
 IF webdock_rls.request_scope() ? 'clerk' THEN
  RETURN EXISTS(SELECT 1 FROM webdock_auth.hosting_setup s
   JOIN webdock_admin.projects p ON p.id=s.project_id JOIN webdock_admin.customers c ON c.id=s.customer_id
   JOIN webdock_auth.hosting_project h ON h.project_id=p.id JOIN webdock_auth.tenant_customer t ON t.customer_id=c.id
   JOIN webdock_auth.clerk_identity i ON i.user_id=s.actor->>'subject' AND i.issuer=s.actor->'consoleIdentity'->>'issuer' AND i.clerk_user_id=s.actor->'consoleIdentity'->>'userID'
   JOIN webdock_auth."user" u ON u.id=i.user_id
   WHERE s.id=webdock_rls.request_scope()->>'setupID' AND s.generation::text=webdock_rls.request_scope()->>'generation'
   AND s.customer_id=customer AND (project IS NULL OR s.project_id=project) AND s.customer_id=webdock_rls.request_scope()->>'customerID'
   AND s.state='running' AND s.confirmed_preview_id IS NOT NULL AND s.lease_until>now() AND c.status='active' AND p.status='active'
   AND s.actor->'scopes' ? 'hosting:write' AND s.actor->'scopes' ? 'hosting:read' AND i.enabled AND NOT coalesce(u.banned,false)
   AND webdock_rls.request_scope()->'clerk'->>'subject'=u.id AND webdock_rls.request_scope()->'clerk'->>'sessionID'=s.actor->>'sessionID'
   AND webdock_rls.request_scope()->'clerk'->>'issuer'=i.issuer AND webdock_rls.request_scope()->'clerk'->>'userID'=i.clerk_user_id
   AND (webdock_rls.request_scope()->'clerk'->>'expiresAt')::numeric>extract(epoch FROM statement_timestamp())*1000
   AND (webdock_rls.request_scope()->'clerk'->>'verifiedAt')::numeric BETWEEN extract(epoch FROM statement_timestamp())*1000-60000 AND extract(epoch FROM statement_timestamp())*1000
   AND (u.role='operator' OR (u.role='user' AND h.mode='selfservice' AND webdock_rls.request_scope()->'clerk'->>'role'='admin' AND webdock_rls.request_scope()->'clerk'->>'customerID'=customer
    AND EXISTS(SELECT 1 FROM webdock_auth.clerk_organization o WHERE o.issuer=i.issuer AND o.organization_id=t.organization_id AND o.enabled AND o.clerk_organization_id=webdock_rls.request_scope()->'clerk'->>'clerkOrganizationID')))
   AND NOT EXISTS(SELECT 1 FROM webdock_auth.console_tenant_preview preview WHERE preview.issuer=i.issuer AND preview.session_id=s.actor->>'sessionID')
   AND NOT EXISTS(SELECT 1 FROM webdock_admin.project_deletion deletion WHERE deletion.project_id=s.project_id AND deletion.status<>'deleted'));
 END IF;
`;
export const clerkBillingSQL = `
CREATE OR REPLACE FUNCTION webdock_rls.billing_admin(customer text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,webdock_rls AS $$
 SELECT coalesce(webdock_rls.actor() IS NOT NULL AND webdock_rls.actor()->'preview'='null'::jsonb AND
 CASE WHEN webdock_rls.actor() ? 'clerk' THEN webdock_rls.actor()->'clerk'->>'customerID'=customer AND webdock_rls.actor()->'clerk'->>'role'='admin'
 ELSE EXISTS(SELECT 1 FROM webdock_auth.tenant_customer t JOIN webdock_admin.customers c ON c.id=t.customer_id WHERE t.customer_id=customer AND c.status='active' AND webdock_rls.membership_role(t.organization_id) IN ('owner','admin')) END,false)
$$;
ALTER FUNCTION webdock_rls.billing_admin(text) OWNER TO webdock_platform_owner;
REVOKE ALL ON FUNCTION webdock_rls.billing_admin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webdock_rls.billing_admin(text) TO webdock_auth_runtime;
`;
export const clerkMembershipSQL = `
CREATE OR REPLACE FUNCTION webdock_rls.membership_role(org text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,webdock_rls AS $$
DECLARE a jsonb; proof jsonb; result text;
BEGIN
 a:=webdock_rls.actor(); IF a IS NULL THEN RETURN NULL; END IF;
 IF a ? 'clerk' THEN RETURN CASE WHEN a->'clerk'->>'organizationID'=org THEN a->'clerk'->>'role' ELSE NULL END; END IF;
 IF EXISTS(SELECT 1 FROM webdock_auth.clerk_organization WHERE organization_id=org) THEN
  proof:=webdock_rls.request_scope()->'memberships';
  IF proof IS NULL OR proof->>'expiresAt' IS NULL OR proof->>'verifiedAt' IS NULL OR (proof->>'expiresAt')::numeric<=extract(epoch FROM statement_timestamp())*1000
   OR (proof->>'verifiedAt')::numeric NOT BETWEEN extract(epoch FROM statement_timestamp())*1000-60000 AND extract(epoch FROM statement_timestamp())*1000
   OR (proof->>'expiresAt')::numeric>(proof->>'verifiedAt')::numeric+60000 THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM webdock_auth.clerk_identity i JOIN webdock_auth.clerk_organization o ON o.issuer=i.issuer WHERE i.user_id=a->>'subject' AND i.issuer=proof->>'issuer' AND i.clerk_user_id=proof->>'userID' AND i.enabled AND o.enabled AND o.organization_id=org) THEN RETURN NULL; END IF;
  SELECT r->>'role' INTO result FROM jsonb_array_elements(proof->'roles') r JOIN webdock_auth.tenant_customer t ON t.organization_id=r->>'organizationID' AND t.customer_id=r->>'customerID' WHERE r->>'organizationID'=org AND r->>'role' IN ('admin','member');
  RETURN result;
 END IF;
 SELECT role INTO result FROM webdock_auth.member WHERE "organizationId"=org AND "userId"=a->>'subject';
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN NULL;
END $$;
ALTER FUNCTION webdock_rls.membership_role(text) OWNER TO webdock_policy_owner;
REVOKE ALL ON FUNCTION webdock_rls.membership_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webdock_rls.membership_role(text) TO webdock_auth_runtime,webdock_worker_runtime,webdock_registry_runtime,webdock_platform_owner;
`;
export const clerkProjectionSQL = `
CREATE OR REPLACE FUNCTION webdock_rls.project_clerk_user(issuer text,provider_user text,provider_org text,display_name text,address text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,webdock_rls AS $$
DECLARE local_id text;
BEGIN
 IF length(issuer)>300 OR length(provider_user)>128 OR length(display_name)>160 OR length(address)>254 OR length(address)<3 THEN RAISE EXCEPTION 'Invalid identity projection' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('clerk-user:'||issuer||':'||provider_user,0));
 SELECT user_id INTO local_id FROM webdock_auth.clerk_identity i WHERE i.issuer=project_clerk_user.issuer AND i.clerk_user_id=provider_user;
 IF FOUND THEN RETURN local_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM webdock_auth.clerk_organization o JOIN webdock_auth.tenant_customer t ON t.organization_id=o.organization_id JOIN webdock_admin.customers c ON c.id=t.customer_id WHERE o.issuer=project_clerk_user.issuer AND o.clerk_organization_id=provider_org AND o.enabled AND c.status='active') THEN RAISE EXCEPTION 'Mapped active team required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('clerk-email:'||lower(address),0));
 IF EXISTS(SELECT 1 FROM webdock_auth."user" WHERE lower(email)=lower(address)) THEN RAISE EXCEPTION 'Explicit identity mapping required' USING ERRCODE='23505'; END IF;
 INSERT INTO webdock_auth."user"(name,email,"emailVerified",role,"mustChangePassword","twoFactorEnabled") VALUES(display_name,address,true,'user',false,false) RETURNING id INTO local_id;
 INSERT INTO webdock_auth.clerk_identity(issuer,clerk_user_id,user_id,legacy_eligible) VALUES(project_clerk_user.issuer,provider_user,local_id,false);
 RETURN local_id;
END $$;
ALTER FUNCTION webdock_rls.project_clerk_user(text,text,text,text,text) OWNER TO webdock_platform_owner;
REVOKE ALL ON FUNCTION webdock_rls.project_clerk_user(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webdock_rls.project_clerk_user(text,text,text,text,text) TO webdock_auth_bootstrap;
`;
