/** Install after request_scope/customer_allowed and owner-only RLS policies. No tenant rows leave these functions. */
export const capacityRlsSQL = String.raw`
CREATE OR REPLACE FUNCTION webdock_rls.capacity_cluster_allowed(cluster_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE scope jsonb; cluster record;
BEGIN
 scope:=webdock_rls.request_scope();
 IF scope IS NULL OR cluster_id IS NULL THEN RETURN false; END IF;
 SELECT c.ownership,c.dedicated_customer_id INTO cluster FROM webdock_auth.hosting_cluster c WHERE c.id=capacity_cluster_allowed.cluster_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF scope->>'kind'='system' AND session_user='webdock_worker_runtime' THEN
  IF scope->>'clusterID' IS NOT NULL AND scope->>'clusterID'<>cluster_id THEN RETURN false; END IF;
  -- The authenticated build dispatcher publishes to both platform and BYOK clusters.
  IF scope->>'purpose'='hosting-setup' THEN RETURN webdock_rls.setup_cluster(cluster_id); END IF;
  IF scope->>'purpose'='git-worker' THEN RETURN true; END IF;
  IF scope->>'purpose'='agent' THEN RETURN coalesce(scope->>'clusterID'=cluster_id,false); END IF;
  IF scope->>'purpose'='database-order' THEN
   RETURN coalesce(scope->>'customerID' IS NOT NULL AND webdock_rls.customer_allowed(scope->>'customerID') AND
    (cluster.ownership='platform' OR (cluster.ownership='tenant' AND cluster.dedicated_customer_id=scope->>'customerID')),false);
  END IF;
  RETURN false;
 END IF;
 IF scope->>'kind' IS DISTINCT FROM 'session' OR session_user<>'webdock_auth_runtime' OR webdock_rls.actor() IS NULL THEN RETURN false; END IF;
 RETURN coalesce(webdock_rls.operator() OR cluster.ownership='platform' OR
  (cluster.ownership='tenant' AND webdock_rls.customer_allowed(cluster.dedicated_customer_id)),false);
END $fn$;
ALTER FUNCTION webdock_rls.capacity_cluster_allowed(text) OWNER TO webdock_platform_owner;
REVOKE ALL ON FUNCTION webdock_rls.capacity_cluster_allowed(text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION webdock_rls.capacity_demand(cluster_id text, demand_kind text, excluded_customer text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE result jsonb; reserved_volume numeric; approved numeric; observed numeric; has_pools boolean;
BEGIN
 IF webdock_rls.capacity_cluster_allowed(cluster_id) IS NOT TRUE OR demand_kind IS NULL OR demand_kind NOT IN ('apps','native','all') THEN RAISE EXCEPTION 'Capacity authorization required' USING ERRCODE='42501'; END IF;
 IF excluded_customer IS NOT NULL AND webdock_rls.customer_allowed(excluded_customer) IS NOT TRUE THEN RAISE EXCEPTION 'Capacity exclusion denied' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(sum(p.capacity_bytes),0),count(*)>0 INTO reserved_volume,has_pools FROM webdock_auth.hosting_database_pool p WHERE p.cluster_id=capacity_demand.cluster_id;
 SELECT reserved_volume+COALESCE(sum((b.demand->>'volumeBytes')::numeric),0) INTO reserved_volume FROM webdock_auth.hosting_database_backend b WHERE b.cluster_id=capacity_demand.cluster_id AND b.state<>'purged' AND NOT EXISTS(SELECT 1 FROM webdock_auth.hosting_database_pool p WHERE p.cluster_id=b.cluster_id AND p.pool_id=b.pool_id);
 SELECT (c.capacity->>'volumeBytes')::numeric,(a.observation->'capacity'->>'volumeBytes')::numeric,
 has_pools OR EXISTS(SELECT 1 FROM webdock_auth.hosting_database_backend b WHERE b.cluster_id=c.id AND b.state<>'purged') OR a.observation->'capabilities'->>'databaseVersion'='1'
 INTO approved,observed,has_pools FROM webdock_auth.hosting_cluster c LEFT JOIN webdock_auth.hosting_agent a ON a.cluster_id=c.id WHERE c.id=capacity_demand.cluster_id;
 IF has_pools AND approved IS NOT NULL AND observed IS NOT NULL THEN reserved_volume=greatest(reserved_volume,approved-observed); END IF;
 WITH reservations AS (
  SELECT r.demand,r.status FROM webdock_auth.hosting_reservation r WHERE r.cluster_id=capacity_demand.cluster_id AND r.status<>'released' AND demand_kind IN ('apps','all')
  UNION ALL SELECT r.demand,r.status FROM webdock_mail.cluster_reservation r WHERE r.cluster_id=capacity_demand.cluster_id AND (excluded_customer IS NULL OR r.customer_id<>excluded_customer) AND demand_kind IN ('native','all')
  UNION ALL SELECT b.demand||jsonb_build_object('volumeBytes',0),CASE WHEN b.state IN ('provisioning','updating') THEN 'reserved' ELSE 'active' END FROM webdock_auth.hosting_database_backend b WHERE b.cluster_id=capacity_demand.cluster_id AND b.state<>'purged' AND demand_kind IN ('native','all')
  UNION ALL SELECT jsonb_build_object('volumeBytes',reserved_volume),'active' WHERE demand_kind IN ('native','all')
 ), dimensions AS (SELECT unnest(ARRAY['apps','cpuMillicores','memoryBytes','volumeBytes','ephemeralBytes','replicasPerApp','concurrentDeployments']) AS key),
 amounts AS (SELECT d.key,CASE WHEN d.key='concurrentDeployments' AND r.status='active' THEN 0 ELSE COALESCE((r.demand->>d.key)::numeric,0) END AS value FROM dimensions d LEFT JOIN reservations r ON true),
 totals AS (SELECT key,CASE WHEN key='replicasPerApp' THEN max(value) ELSE sum(value) END AS value,min(value) AS minimum,bool_and(value=trunc(value)) AS integral FROM amounts GROUP BY key)
 SELECT jsonb_object_agg(key,value) INTO result FROM totals WHERE integral AND minimum>=0 AND value BETWEEN 0 AND 9007199254740991 AND value=trunc(value);
 IF (SELECT count(*) FROM jsonb_object_keys(result))<>7 THEN RAISE EXCEPTION 'Invalid cluster reservation'; END IF;
 RETURN result;
END $fn$;
CREATE OR REPLACE FUNCTION webdock_rls.capacity_pools(cluster_id text)
RETURNS TABLE(node text,pool_id text,capacity_bytes text,held_cpu numeric,held_memory numeric,held_volume numeric,known_cpu numeric,known_memory numeric,allocated numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF webdock_rls.capacity_cluster_allowed(cluster_id) IS NOT TRUE THEN RAISE EXCEPTION 'Capacity authorization required' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH physical AS (SELECT b.id,b.node,b.pool_id,b.demand FROM webdock_auth.hosting_database_backend b WHERE b.cluster_id=capacity_pools.cluster_id AND b.state<>'purged'),
 pools AS (SELECT p.node,p.pool_id,p.capacity_bytes,o.value AS observation FROM webdock_auth.hosting_database_pool p LEFT JOIN webdock_auth.hosting_agent a ON a.cluster_id=p.cluster_id LEFT JOIN LATERAL jsonb_array_elements(COALESCE(a.observation->'capabilities'->'databasePools','[]'::jsonb)) o ON o.value->>'node'=p.node AND o.value->>'poolID'=p.pool_id::text WHERE p.cluster_id=capacity_pools.cluster_id)
 SELECT p.node::text,p.pool_id::text,p.capacity_bytes::text,
 COALESCE((SELECT sum((b.demand->>'cpuMillicores')::numeric) FROM physical b WHERE b.node=p.node),0),
 COALESCE((SELECT sum((b.demand->>'memoryBytes')::numeric) FROM physical b WHERE b.node=p.node),0),
 COALESCE((SELECT sum((b.demand->>'volumeBytes')::numeric) FROM physical b WHERE b.node=p.node AND b.pool_id=p.pool_id),0),
 COALESCE((SELECT sum((o->>'cpuMillicores')::numeric) FROM jsonb_array_elements(COALESCE(p.observation->'observedDatabases','[]'::jsonb)) o WHERE EXISTS(SELECT 1 FROM physical b WHERE b.node=p.node AND b.id=o->>'installationID')),0),
 COALESCE((SELECT sum((o->>'memoryBytes')::numeric) FROM jsonb_array_elements(COALESCE(p.observation->'observedDatabases','[]'::jsonb)) o WHERE EXISTS(SELECT 1 FROM physical b WHERE b.node=p.node AND b.id=o->>'installationID')),0),
 COALESCE((SELECT sum((o->>'volumeBytes')::numeric) FROM jsonb_array_elements(COALESCE(p.observation->'allocations','[]'::jsonb)) o WHERE EXISTS(SELECT 1 FROM physical b WHERE b.node=p.node AND b.id=o->>'installationID')),0)
 FROM pools p;
END $fn$;
CREATE OR REPLACE FUNCTION webdock_rls.capacity_slots(backend_id text, excluded_database text DEFAULT NULL)
RETURNS TABLE(count integer,bytes text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM webdock_auth.hosting_database_backend b WHERE b.id=capacity_slots.backend_id AND webdock_rls.capacity_cluster_allowed(b.cluster_id)) THEN RAISE EXCEPTION 'Capacity authorization required' USING ERRCODE='42501'; END IF;
 IF excluded_database IS NOT NULL AND NOT EXISTS(SELECT 1 FROM webdock_auth.hosting_database d WHERE d.id=excluded_database AND d.backend_id=capacity_slots.backend_id AND webdock_rls.customer_allowed(d.customer_id)) THEN RAISE EXCEPTION 'Capacity exclusion denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT sum(x.count)::integer,sum(x.bytes)::text FROM (
 SELECT count(*) AS count,COALESCE(sum((p.plan->>'logicalStorageAllowanceBytes')::numeric),0) AS bytes FROM webdock_auth.hosting_database d JOIN webdock_auth.hosting_database_plan p ON p.id=COALESCE(d.pending_plan_revision_id,d.plan_revision_id) WHERE d.backend_id=capacity_slots.backend_id AND d.state<>'purged' AND (excluded_database IS NULL OR d.id<>excluded_database)
 UNION ALL SELECT count(*),COALESCE(sum(m.source_allowance_bytes),0) FROM webdock_auth.hosting_database_migration m WHERE m.source_backend_id=capacity_slots.backend_id AND m.state='retained') x;
END $fn$;
ALTER FUNCTION webdock_rls.capacity_demand(text,text,text) OWNER TO webdock_platform_owner;
ALTER FUNCTION webdock_rls.capacity_pools(text) OWNER TO webdock_platform_owner;
ALTER FUNCTION webdock_rls.capacity_slots(text,text) OWNER TO webdock_platform_owner;
REVOKE ALL ON FUNCTION webdock_rls.capacity_demand(text,text,text),webdock_rls.capacity_pools(text),webdock_rls.capacity_slots(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webdock_rls.capacity_demand(text,text,text),webdock_rls.capacity_pools(text),webdock_rls.capacity_slots(text,text) TO webdock_auth_runtime,webdock_worker_runtime;
`;
