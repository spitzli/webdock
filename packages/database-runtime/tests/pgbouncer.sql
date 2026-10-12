CREATE EXTENSION pgcrypto;
CREATE ROLE scoped_runtime LOGIN PASSWORD 'runtime-local-only' NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
CREATE TABLE private.keys (aud text PRIMARY KEY, secret text NOT NULL);
INSERT INTO private.keys VALUES ('scoped_runtime', 'local-fixture-signing-key-at-least-32-bytes');
CREATE FUNCTION public.verified_subject() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE context text; signature text; claim jsonb; key text;
BEGIN
 context := current_setting('webdock.rls_context', true);
 signature := current_setting('webdock.rls_signature', true);
 IF context IS NULL OR context = '' OR signature IS NULL OR signature = '' THEN RETURN NULL; END IF;
 claim := context::jsonb;
 IF claim->>'aud' <> session_user OR (claim->>'v')::int <> 1 OR (claim->>'exp')::bigint <= extract(epoch from clock_timestamp()) THEN RETURN NULL; END IF;
 SELECT secret INTO key FROM private.keys WHERE aud=session_user;
 IF key IS NULL OR signature <> encode(public.hmac(context,key,'sha256'),'hex') THEN RETURN NULL; END IF;
 IF claim->'scope'->>'kind' <> 'session' THEN RETURN NULL; END IF;
 RETURN claim->'scope'->>'subject';
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.verified_subject() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verified_subject() TO scoped_runtime;
CREATE TABLE public.tenant_rows (id integer PRIMARY KEY, tenant text NOT NULL, value text NOT NULL);
INSERT INTO public.tenant_rows VALUES (1,'alice','Alice private'),(2,'bob','Bob private');
ALTER TABLE public.tenant_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON public.tenant_rows TO scoped_runtime USING (tenant=public.verified_subject()) WITH CHECK (tenant=public.verified_subject());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tenant_rows TO scoped_runtime;
