/** Offline-installed, signed-scope check. SECURITY DEFINER prevents recursive RLS on its narrow metadata reads. */
export const pluginScopeSQL = `
CREATE OR REPLACE FUNCTION webdock_rls.plugin_context(capability text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,webdock_rls AS $plugin$
DECLARE scope jsonb; invocation record; actor jsonb;
BEGIN
 scope:=webdock_rls.request_scope();
 IF scope IS NULL OR scope->>'pluginInvocationID' IS NULL THEN RETURN NULL; END IF;
 SELECT v.* INTO invocation FROM webdock_auth.plugin_invocation v
 JOIN webdock_auth.plugin_installation p ON p.id=v.plugin_id
 JOIN webdock_auth.plugin_runtime r ON r.plugin_id=p.id AND r.generation=p.current_generation
 JOIN webdock_auth.plugin_configuration config ON config.plugin_id=p.id
 JOIN webdock_auth.plugin_grant g ON g.plugin_id=v.plugin_id AND g.customer_id=v.customer_id AND g.project_id=v.project_id
 JOIN webdock_admin.customers c ON c.id=v.customer_id AND c.status='active'
 JOIN webdock_admin.projects project ON project.id=v.project_id AND project.customer_id=v.customer_id AND project.status='active'
 WHERE v.id::text=scope->>'pluginInvocationID' AND v.revoked_at IS NULL AND v.created_at<=statement_timestamp() AND v.expires_at>statement_timestamp() AND v.expires_at<=statement_timestamp()+interval '60 seconds'
 AND p.state IN ('enabled','draining') AND p.runtime='ready' AND r.status IN ('ready','draining')
 AND p.current_generation=v.runtime_generation AND r.configuration_revision=config.revision
 AND g.revoked_at IS NULL AND g.revision=v.grant_revision
 AND (capability IS NULL OR (config.approved_capabilities ? capability AND g.capabilities ? capability AND v.capabilities ? capability))
 AND (capability IS NULL OR capability IN ('plugin.apps.read','project.read','plugin.data.read','plugin.db.read','plugin.cache.read','plugin.storage.read','plugin.secrets.read','plugin.http.read') OR v.intent='write')
 AND NOT EXISTS(SELECT 1 FROM webdock_admin.project_deletion d WHERE d.project_id=project.id AND d.status<>'deleted');
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF invocation.kind='action' THEN
  actor:=webdock_rls.actor();
  IF actor IS NULL OR actor->>'subject' IS DISTINCT FROM invocation.actor_id OR actor->>'sessionID' IS DISTINCT FROM invocation.session_id
   OR actor->'preview' IS DISTINCT FROM 'null'::jsonb OR NOT webdock_rls.customer_allowed(invocation.customer_id,false) THEN RETURN NULL; END IF;
 ELSE
  IF NOT webdock_rls.worker(ARRAY['plugin-job']::text[]) OR NOT EXISTS(
   SELECT 1 FROM webdock_auth.plugin_job_execution e JOIN webdock_auth.plugin_grant g ON g.plugin_id=e.plugin_id AND g.customer_id=e.customer_id AND g.project_id=e.project_id
   WHERE e.id=invocation.job_execution_id AND e.plugin_id=invocation.plugin_id AND e.customer_id=invocation.customer_id AND e.project_id=invocation.project_id
   AND e.name=invocation.name AND g.jobs ? e.name AND e.grant_revision=invocation.grant_revision
   AND e.claim_token=invocation.job_claim_token AND e.runtime_generation=invocation.runtime_generation AND e.status='running' AND e.lease_until>statement_timestamp() AND NOT e.cancel_requested
  ) THEN RETURN NULL; END IF;
 END IF;
 RETURN jsonb_build_object('pluginID',invocation.plugin_id,'customerID',invocation.customer_id,'projectID',invocation.project_id,'operationID',invocation.operation_id);
END $plugin$;
ALTER FUNCTION webdock_rls.plugin_context(text) OWNER TO webdock_platform_owner;
REVOKE ALL ON FUNCTION webdock_rls.plugin_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webdock_rls.plugin_context(text) TO webdock_auth_runtime,webdock_worker_runtime;
CREATE OR REPLACE FUNCTION webdock_rls.plugin_allows(plugin text, customer text, project text, capability text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,webdock_rls AS $plugin$
 SELECT coalesce(webdock_rls.plugin_context(capability) @> jsonb_build_object('pluginID',plugin,'customerID',customer,'projectID',project),false)
$plugin$;
ALTER FUNCTION webdock_rls.plugin_allows(text,text,text,text) OWNER TO webdock_platform_owner;
REVOKE ALL ON FUNCTION webdock_rls.plugin_allows(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webdock_rls.plugin_allows(text,text,text,text) TO webdock_auth_runtime,webdock_worker_runtime;
`;
