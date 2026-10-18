--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: webdock_admin; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA webdock_admin;


--
-- Name: webdock_auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA webdock_auth;


--
-- Name: webdock_mail; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA webdock_mail;


--
-- Name: enum_audit_events_action; Type: TYPE; Schema: webdock_admin; Owner: -
--

CREATE TYPE webdock_admin.enum_audit_events_action AS ENUM (
    'create',
    'update'
);


--
-- Name: enum_cms_instances_provider; Type: TYPE; Schema: webdock_admin; Owner: -
--

CREATE TYPE webdock_admin.enum_cms_instances_provider AS ENUM (
    'vercel',
    'other'
);


--
-- Name: enum_cms_instances_status; Type: TYPE; Schema: webdock_admin; Owner: -
--

CREATE TYPE webdock_admin.enum_cms_instances_status AS ENUM (
    'active',
    'suspended',
    'retired'
);


--
-- Name: enum_cms_instances_template; Type: TYPE; Schema: webdock_admin; Owner: -
--

CREATE TYPE webdock_admin.enum_cms_instances_template AS ENUM (
    'webdock-landing',
    'spitzli-portfolio',
    'stall-business',
    'custom'
);


--
-- Name: enum_customers_customer_type; Type: TYPE; Schema: webdock_admin; Owner: -
--

CREATE TYPE webdock_admin.enum_customers_customer_type AS ENUM (
    'person',
    'company'
);


--
-- Name: enum_customers_status; Type: TYPE; Schema: webdock_admin; Owner: -
--

CREATE TYPE webdock_admin.enum_customers_status AS ENUM (
    'active',
    'archived'
);


--
-- Name: enum_projects_status; Type: TYPE; Schema: webdock_admin; Owner: -
--

CREATE TYPE webdock_admin.enum_projects_status AS ENUM (
    'active',
    'archived'
);


--
-- Name: enum_users_role; Type: TYPE; Schema: webdock_admin; Owner: -
--

CREATE TYPE webdock_admin.enum_users_role AS ENUM (
    'operator',
    'admin',
    'editor',
    'reader'
);


--
-- Name: lock_hosting_project(character varying); Type: FUNCTION; Schema: webdock_admin; Owner: -
--

CREATE FUNCTION webdock_admin.lock_hosting_project(p_project_id character varying) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
BEGIN
 PERFORM id FROM webdock_admin.projects WHERE id=p_project_id FOR SHARE;
END;
$$;


--
-- Name: next_snowflake(); Type: FUNCTION; Schema: webdock_admin; Owner: -
--

CREATE FUNCTION webdock_admin.next_snowflake() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE wall_ms bigint; next_ms bigint; last_value bigint; counter integer;
BEGIN
 wall_ms := floor(extract(epoch FROM clock_timestamp())*1000)::bigint - 1767225600000;
 SELECT last_ms, sequence INTO last_value, counter FROM webdock_admin.snowflake_state WHERE singleton FOR UPDATE;
 next_ms := greatest(wall_ms,last_value);
 IF next_ms > last_value THEN counter := 0;
 ELSIF counter = 4095 THEN next_ms := next_ms+1; counter := 0;
 ELSE counter := counter+1;
 END IF;
 IF next_ms-wall_ms > 5000 THEN RAISE EXCEPTION 'Snowflake clock drift exceeds five seconds' USING ERRCODE='54000'; END IF;
 IF next_ms < 0 OR next_ms >= 2199023255552 THEN RAISE EXCEPTION 'Snowflake epoch range exceeded' USING ERRCODE='54000'; END IF;
 UPDATE webdock_admin.snowflake_state SET last_ms=next_ms, sequence=counter WHERE singleton;
 RETURN ((next_ms << 22) | (0::bigint << 12) | counter::bigint)::text;
END;
$$;


--
-- Name: database_immutable_terms(); Type: FUNCTION; Schema: webdock_auth; Owner: -
--

CREATE FUNCTION webdock_auth.database_immutable_terms() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 IF TG_TABLE_NAME='hosting_database_plan' THEN
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN RAISE EXCEPTION 'Database plan revisions are immutable'; END IF;
 ELSIF TG_TABLE_NAME='hosting_database_offer' THEN
  RAISE EXCEPTION 'Database offers are immutable';
 ELSE
  IF OLD.database_id IS NOT NULL AND NEW.database_id IS DISTINCT FROM OLD.database_id THEN RAISE EXCEPTION 'Database order is already consumed'; END IF;
  IF (NEW.offer_id,NEW.customer_id,NEW.project_id,NEW.plan_revision_id,NEW.accepted_by,NEW.accepted_at,NEW.snapshot)
     IS DISTINCT FROM (OLD.offer_id,OLD.customer_id,OLD.project_id,OLD.plan_revision_id,OLD.accepted_by,OLD.accepted_at,OLD.snapshot)
  THEN RAISE EXCEPTION 'Accepted database terms are immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;


--
-- Name: guard_customer_owner(); Type: FUNCTION; Schema: webdock_auth; Owner: -
--

CREATE FUNCTION webdock_auth.guard_customer_owner() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'webdock_auth'
    AS $$
DECLARE org text;
BEGIN
 IF TG_TABLE_NAME='member' THEN
  IF OLD.role<>'owner' THEN RETURN coalesce(NEW,OLD); END IF;
  IF TG_OP='UPDATE' AND NEW.role='owner' AND NEW."userId"=OLD."userId" AND NEW."organizationId"=OLD."organizationId" THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM webdock_auth."user" WHERE id=OLD."userId" AND role='user' AND NOT coalesce(banned,false) AND "emailVerified" AND NOT "mustChangePassword") THEN RETURN coalesce(NEW,OLD); END IF;
  org:=OLD."organizationId";
  PERFORM 1 FROM webdock_auth.organization o JOIN webdock_auth.tenant_customer t ON t.organization_id=o.id WHERE o.id=org FOR UPDATE OF o;
  IF FOUND AND NOT EXISTS(SELECT 1 FROM webdock_auth.member m JOIN webdock_auth."user" u ON u.id=m."userId" WHERE m."organizationId"=org AND m.id<>OLD.id AND m.role='owner' AND u.role='user' AND NOT coalesce(u.banned,false) AND u."emailVerified" AND NOT u."mustChangePassword") THEN
   RAISE EXCEPTION 'Keep at least one active verified customer owner.' USING ERRCODE='23514';
  END IF;
 ELSE
  IF OLD.role<>'user' OR coalesce(OLD.banned,false) OR NOT OLD."emailVerified" OR OLD."mustChangePassword" THEN RETURN coalesce(NEW,OLD); END IF;
  IF TG_OP='UPDATE' AND NEW.role='user' AND NOT coalesce(NEW.banned,false) AND NEW."emailVerified" AND NOT NEW."mustChangePassword" THEN RETURN NEW; END IF;
  FOR org IN SELECT o.id FROM webdock_auth.organization o JOIN webdock_auth.tenant_customer t ON t.organization_id=o.id JOIN webdock_auth.member m ON m."organizationId"=o.id WHERE m."userId"=OLD.id AND m.role='owner' ORDER BY o.id FOR UPDATE OF o LOOP
   IF NOT EXISTS(SELECT 1 FROM webdock_auth.member m JOIN webdock_auth."user" u ON u.id=m."userId" WHERE m."organizationId"=org AND m."userId"<>OLD.id AND m.role='owner' AND u.role='user' AND NOT coalesce(u.banned,false) AND u."emailVerified" AND NOT u."mustChangePassword") THEN
    RAISE EXCEPTION 'Keep at least one active verified customer owner.' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END IF;
 RETURN coalesce(NEW,OLD);
END;
$$;


--
-- Name: next_snowflake(); Type: FUNCTION; Schema: webdock_auth; Owner: -
--

CREATE FUNCTION webdock_auth.next_snowflake() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE wall_ms bigint; next_ms bigint; last_value bigint; counter integer;
BEGIN
 wall_ms := floor(extract(epoch FROM clock_timestamp())*1000)::bigint - 1767225600000;
 SELECT last_ms, sequence INTO last_value, counter FROM webdock_auth.snowflake_state WHERE singleton FOR UPDATE;
 next_ms := greatest(wall_ms,last_value);
 IF next_ms > last_value THEN counter := 0;
 ELSIF counter = 4095 THEN next_ms := next_ms+1; counter := 0;
 ELSE counter := counter+1;
 END IF;
 IF next_ms-wall_ms > 5000 THEN RAISE EXCEPTION 'Snowflake clock drift exceeds five seconds' USING ERRCODE='54000'; END IF;
 IF next_ms < 0 OR next_ms >= 2199023255552 THEN RAISE EXCEPTION 'Snowflake epoch range exceeded' USING ERRCODE='54000'; END IF;
 UPDATE webdock_auth.snowflake_state SET last_ms=next_ms, sequence=counter WHERE singleton;
 RETURN ((next_ms << 22) | (1::bigint << 12) | counter::bigint)::text;
END;
$$;


--
-- Name: sync_customer_tenant(); Type: FUNCTION; Schema: webdock_auth; Owner: -
--

CREATE FUNCTION webdock_auth.sync_customer_tenant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE tenant_id text;
BEGIN
 SELECT organization_id INTO tenant_id FROM webdock_auth.tenant_customer WHERE customer_id=NEW.id;
 IF tenant_id IS NULL THEN
   tenant_id := webdock_auth.next_snowflake();
   INSERT INTO webdock_auth.organization(id,name,slug,"createdAt")
   VALUES(tenant_id,NEW.name,'customer-' || NEW.id,now());
   INSERT INTO webdock_auth.tenant_customer(customer_id,organization_id) VALUES(NEW.id,tenant_id);
 ELSE
   UPDATE webdock_auth.organization SET name=NEW.name WHERE id=tenant_id;
 END IF;
 RETURN NEW;
END;
$$;


--
-- Name: revoke_detached_member(); Type: FUNCTION; Schema: webdock_mail; Owner: -
--

CREATE FUNCTION webdock_mail.revoke_detached_member() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE next_revision bigint;
BEGIN
 IF TG_WHEN='BEFORE' THEN
  NEW.enabled := false;
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
 END IF;
 INSERT INTO webdock_mail.configuration(customer_id) VALUES(NEW.customer_id)
 ON CONFLICT(customer_id) DO UPDATE SET revision=configuration.revision+1 RETURNING revision INTO next_revision;
 UPDATE webdock_mail.configuration_operation SET state='superseded',finished_at=now() WHERE customer_id=NEW.customer_id AND state='pending';
 INSERT INTO webdock_mail.configuration_operation(customer_id,revision,requested_by,reason) VALUES(NEW.customer_id,next_revision,NULL,'membership_revoked');
 RETURN NULL;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_events; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.audit_events (
    id character varying NOT NULL,
    actor_id character varying NOT NULL,
    action webdock_admin.enum_audit_events_action NOT NULL,
    target_collection character varying NOT NULL,
    target_i_d character varying NOT NULL,
    summary character varying NOT NULL,
    changed_fields character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: cms_instances; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.cms_instances (
    id character varying NOT NULL,
    label character varying NOT NULL,
    project_id character varying NOT NULL,
    admin_u_r_l character varying NOT NULL,
    schema_name character varying NOT NULL,
    provider webdock_admin.enum_cms_instances_provider DEFAULT 'vercel'::webdock_admin.enum_cms_instances_provider NOT NULL,
    provider_project_i_d character varying NOT NULL,
    template webdock_admin.enum_cms_instances_template NOT NULL,
    payload_version character varying,
    status webdock_admin.enum_cms_instances_status DEFAULT 'active'::webdock_admin.enum_cms_instances_status NOT NULL,
    notes character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.customers (
    id character varying NOT NULL,
    name character varying NOT NULL,
    contact_name character varying,
    contact_email character varying,
    notes character varying,
    status webdock_admin.enum_customers_status DEFAULT 'active'::webdock_admin.enum_customers_status NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    customer_type webdock_admin.enum_customers_customer_type DEFAULT 'company'::webdock_admin.enum_customers_customer_type,
    first_name character varying,
    last_name character varying,
    company_name character varying,
    phone character varying,
    address_line1 character varying,
    address_line2 character varying,
    postal_code character varying,
    city character varying,
    region character varying,
    country character varying
);


--
-- Name: payload_kv; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.payload_kv (
    id integer NOT NULL,
    key character varying NOT NULL,
    data jsonb NOT NULL
);


--
-- Name: payload_kv_id_seq; Type: SEQUENCE; Schema: webdock_admin; Owner: -
--

CREATE SEQUENCE webdock_admin.payload_kv_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_kv_id_seq; Type: SEQUENCE OWNED BY; Schema: webdock_admin; Owner: -
--

ALTER SEQUENCE webdock_admin.payload_kv_id_seq OWNED BY webdock_admin.payload_kv.id;


--
-- Name: payload_locked_documents; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.payload_locked_documents (
    id integer NOT NULL,
    global_slug character varying,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: payload_locked_documents_id_seq; Type: SEQUENCE; Schema: webdock_admin; Owner: -
--

CREATE SEQUENCE webdock_admin.payload_locked_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_locked_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: webdock_admin; Owner: -
--

ALTER SEQUENCE webdock_admin.payload_locked_documents_id_seq OWNED BY webdock_admin.payload_locked_documents.id;


--
-- Name: payload_locked_documents_rels; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.payload_locked_documents_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    users_id character varying,
    customers_id character varying,
    projects_id character varying,
    cms_instances_id character varying,
    audit_events_id character varying
);


--
-- Name: payload_locked_documents_rels_id_seq; Type: SEQUENCE; Schema: webdock_admin; Owner: -
--

CREATE SEQUENCE webdock_admin.payload_locked_documents_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_locked_documents_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: webdock_admin; Owner: -
--

ALTER SEQUENCE webdock_admin.payload_locked_documents_rels_id_seq OWNED BY webdock_admin.payload_locked_documents_rels.id;


--
-- Name: payload_migrations; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.payload_migrations (
    id integer NOT NULL,
    name character varying,
    batch numeric,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: payload_migrations_id_seq; Type: SEQUENCE; Schema: webdock_admin; Owner: -
--

CREATE SEQUENCE webdock_admin.payload_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: webdock_admin; Owner: -
--

ALTER SEQUENCE webdock_admin.payload_migrations_id_seq OWNED BY webdock_admin.payload_migrations.id;


--
-- Name: payload_preferences; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.payload_preferences (
    id integer NOT NULL,
    key character varying,
    value jsonb,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: payload_preferences_id_seq; Type: SEQUENCE; Schema: webdock_admin; Owner: -
--

CREATE SEQUENCE webdock_admin.payload_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: webdock_admin; Owner: -
--

ALTER SEQUENCE webdock_admin.payload_preferences_id_seq OWNED BY webdock_admin.payload_preferences.id;


--
-- Name: payload_preferences_rels; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.payload_preferences_rels (
    id integer NOT NULL,
    "order" integer,
    parent_id integer NOT NULL,
    path character varying NOT NULL,
    users_id character varying
);


--
-- Name: payload_preferences_rels_id_seq; Type: SEQUENCE; Schema: webdock_admin; Owner: -
--

CREATE SEQUENCE webdock_admin.payload_preferences_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payload_preferences_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: webdock_admin; Owner: -
--

ALTER SEQUENCE webdock_admin.payload_preferences_rels_id_seq OWNED BY webdock_admin.payload_preferences_rels.id;


--
-- Name: project_deletion; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.project_deletion (
    project_id character varying NOT NULL,
    plan jsonb NOT NULL,
    plan_hash text NOT NULL,
    completed_steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'prepared'::text NOT NULL,
    actor_id text NOT NULL,
    last_error text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.projects (
    id character varying NOT NULL,
    name character varying NOT NULL,
    customer_id character varying NOT NULL,
    url character varying,
    repository_u_r_l character varying,
    notes character varying,
    status webdock_admin.enum_projects_status DEFAULT 'active'::webdock_admin.enum_projects_status NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL
);


--
-- Name: snowflake_state; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.snowflake_state (
    singleton boolean DEFAULT true NOT NULL,
    last_ms bigint DEFAULT 0 NOT NULL,
    sequence integer DEFAULT '-1'::integer NOT NULL,
    CONSTRAINT snowflake_state_sequence_check CHECK (((sequence >= '-1'::integer) AND (sequence <= 4095))),
    CONSTRAINT snowflake_state_singleton_check CHECK (singleton)
);


--
-- Name: users; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.users (
    id character varying NOT NULL,
    name character varying NOT NULL,
    role webdock_admin.enum_users_role DEFAULT 'editor'::webdock_admin.enum_users_role NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
    email character varying NOT NULL,
    reset_password_token character varying,
    reset_password_expiration timestamp(3) with time zone,
    salt character varying,
    hash character varying,
    reset_password_requested_at timestamp(3) with time zone,
    login_attempts numeric DEFAULT 0,
    lock_until timestamp(3) with time zone,
    auth_subject character varying
);


--
-- Name: users_sessions; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.users_sessions (
    _order integer NOT NULL,
    _parent_id character varying NOT NULL,
    id character varying NOT NULL,
    created_at timestamp(3) with time zone,
    expires_at timestamp(3) with time zone NOT NULL
);


--
-- Name: vercel_connection; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.vercel_connection (
    team_id text NOT NULL,
    configuration_id text NOT NULL,
    encrypted_token text NOT NULL,
    connected_by text NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vercel_project_link; Type: TABLE; Schema: webdock_admin; Owner: -
--

CREATE TABLE webdock_admin.vercel_project_link (
    project_id character varying NOT NULL,
    team_id text NOT NULL,
    vercel_project_id text NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: access_event; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.access_event (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    actor_id text NOT NULL,
    action text NOT NULL,
    target_id text,
    outcome text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.account (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: app_binding; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.app_binding (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    client_id text NOT NULL,
    label text NOT NULL,
    organization_id text,
    enabled boolean DEFAULT true NOT NULL
);


--
-- Name: database_audit; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.database_audit (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    subject text NOT NULL,
    action text NOT NULL,
    binding_id character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: database_binding; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.database_binding (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    project_id character varying NOT NULL,
    name text NOT NULL,
    environment text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    engine text DEFAULT 'postgresql'::text NOT NULL,
    CONSTRAINT database_binding_engine_check CHECK ((engine = ANY (ARRAY['postgresql'::text, 'sqlite'::text]))),
    CONSTRAINT database_binding_environment_check CHECK ((environment = ANY (ARRAY['production'::text, 'staging'::text, 'development'::text]))),
    CONSTRAINT database_binding_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120)))
);


--
-- Name: database_grant; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.database_grant (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    binding_id character varying NOT NULL,
    subject text NOT NULL,
    profile text NOT NULL,
    runtime_origin text NOT NULL,
    connection_id text NOT NULL,
    secret_sealed text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT database_grant_profile_check CHECK ((profile = ANY (ARRAY['read'::text, 'write'::text, 'schema'::text])))
);


--
-- Name: database_launch; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.database_launch (
    token_hash text NOT NULL,
    grant_id character varying NOT NULL,
    grant_revision integer NOT NULL,
    session_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone
);


--
-- Name: database_runtime_owner; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.database_runtime_owner (
    runtime_origin text NOT NULL,
    binding_id character varying NOT NULL,
    subject text NOT NULL,
    profile text NOT NULL,
    CONSTRAINT database_runtime_owner_profile_check CHECK ((profile = ANY (ARRAY['read'::text, 'write'::text, 'schema'::text])))
);


--
-- Name: database_session; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.database_session (
    token_hash text NOT NULL,
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    grant_id character varying NOT NULL,
    grant_revision integer NOT NULL,
    session_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: git_artifact; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.git_artifact (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    build_id character varying NOT NULL,
    customer_id character varying NOT NULL,
    project_id character varying NOT NULL,
    kind text NOT NULL,
    digest text NOT NULL,
    storage_key text NOT NULL,
    size_bytes bigint NOT NULL,
    retained boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    storage_purged_at timestamp with time zone,
    CONSTRAINT git_artifact_digest_check CHECK ((digest ~ '^sha256:[a-f0-9]{64}$'::text)),
    CONSTRAINT git_artifact_kind_check CHECK ((kind = ANY (ARRAY['oci'::text, 'vercel'::text]))),
    CONSTRAINT git_artifact_size_bytes_check CHECK (((size_bytes >= 1) AND (size_bytes <= '10737418240'::bigint)))
);


--
-- Name: git_build; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.git_build (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    project_id character varying NOT NULL,
    source_id character varying NOT NULL,
    source_sha text NOT NULL,
    source_revision integer NOT NULL,
    connection_generation integer NOT NULL,
    environment_revision integer NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    worker_id character varying,
    worker_generation integer,
    generation integer DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    subject text NOT NULL,
    idempotency_key text NOT NULL,
    logs text DEFAULT ''::text NOT NULL,
    failure_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    actions_provenance jsonb,
    environment_identity text,
    target_revision integer,
    provider_configuration_identity text,
    CONSTRAINT git_build_logs_check CHECK ((octet_length(logs) <= 262144)),
    CONSTRAINT git_build_source_sha_check CHECK ((source_sha ~ '^[a-f0-9]{40}$'::text)),
    CONSTRAINT git_build_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: git_check_outbox; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.git_check_outbox (
    build_id character varying NOT NULL,
    installation_id text NOT NULL,
    repository_id text NOT NULL,
    source_sha text NOT NULL,
    status text NOT NULL,
    conclusion text,
    check_id text,
    version integer DEFAULT 1 NOT NULL,
    processed_version integer DEFAULT 0 NOT NULL,
    generation integer DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    retry_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT git_check_outbox_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'in_progress'::text, 'completed'::text])))
);


--
-- Name: git_connection; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.git_connection (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    installation_id text NOT NULL,
    account_id text NOT NULL,
    account_login text NOT NULL,
    permissions jsonb NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    generation integer DEFAULT 1 NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT git_connection_generation_check CHECK ((generation > 0)),
    CONSTRAINT git_connection_state_check CHECK ((state = ANY (ARRAY['active'::text, 'disconnected'::text, 'revalidation-required'::text])))
);


--
-- Name: git_flow; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.git_flow (
    state_hash text NOT NULL,
    subject text NOT NULL,
    session_id text NOT NULL,
    customer_id character varying NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    user_token_encrypted text,
    installation_id text,
    setup_id character varying
);


--
-- Name: git_receipt; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.git_receipt (
    delivery_id text NOT NULL,
    event text NOT NULL,
    installation_id text NOT NULL,
    processed_at timestamp with time zone,
    event_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    failure_code text
);


--
-- Name: git_release; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.git_release (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    project_id character varying NOT NULL,
    artifact_id character varying NOT NULL,
    status text DEFAULT 'awaiting-approval'::text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    source_revision integer NOT NULL,
    connection_generation integer NOT NULL,
    environment_revision integer NOT NULL,
    subject text NOT NULL,
    approved_by text,
    idempotency_key text,
    operation_id text,
    provider_deployment_id text,
    generation integer DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    worker_id character varying,
    worker_generation integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_id character varying NOT NULL,
    publication_started_at timestamp with time zone,
    publication_target jsonb,
    approved_session_id text,
    approved_source text,
    approved_scopes jsonb,
    environment_identity text,
    CONSTRAINT git_release_status_check CHECK ((status = ANY (ARRAY['awaiting-approval'::text, 'queued'::text, 'deploying'::text, 'ready'::text, 'failed'::text, 'superseded'::text, 'needs-reconciliation'::text])))
);


--
-- Name: git_repository; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.git_repository (
    connection_id character varying NOT NULL,
    customer_id character varying NOT NULL,
    repository_id text NOT NULL,
    metadata jsonb NOT NULL
);


--
-- Name: git_source; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.git_source (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    project_id character varying NOT NULL,
    connection_id character varying NOT NULL,
    repository_id text NOT NULL,
    branch text NOT NULL,
    root_directory text NOT NULL,
    recipe text NOT NULL,
    target_id character varying NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    environment_revision integer DEFAULT 1 NOT NULL,
    latest_build_id character varying,
    desired_release_id character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    health_path text DEFAULT '/'::text NOT NULL,
    build_provider text DEFAULT 'isolated'::text NOT NULL,
    workflow_path text DEFAULT '.github/workflows/webdock.yml'::text NOT NULL,
    artifact_prefix text DEFAULT 'webdock'::text NOT NULL,
    actions_configured_at timestamp with time zone DEFAULT now() NOT NULL,
    environment_identity text,
    auto_publish boolean DEFAULT false NOT NULL,
    policy_subject text,
    policy_revision integer,
    build_environment_encrypted text,
    CONSTRAINT git_source_build_provider_check CHECK ((build_provider = ANY (ARRAY['isolated'::text, 'github-actions'::text]))),
    CONSTRAINT git_source_recipe_check CHECK ((recipe = ANY (ARRAY['dockerfile'::text, 'vercel'::text])))
);


--
-- Name: git_vercel_target; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.git_vercel_target (
    customer_id character varying NOT NULL,
    project_id character varying NOT NULL,
    target_id text NOT NULL,
    team_id text NOT NULL,
    mode text NOT NULL,
    generation integer DEFAULT 1 NOT NULL,
    CONSTRAINT git_vercel_target_generation_check CHECK ((generation > 0)),
    CONSTRAINT git_vercel_target_mode_check CHECK ((mode = ANY (ARRAY['byok'::text, 'platform'::text]))),
    CONSTRAINT git_vercel_target_target_id_check CHECK ((target_id ~ '^prj_[A-Za-z0-9]+$'::text)),
    CONSTRAINT git_vercel_target_team_id_check CHECK ((team_id ~ '^team_[A-Za-z0-9]+$'::text))
);


--
-- Name: git_worker; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.git_worker (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    credential_hash text NOT NULL,
    generation integer DEFAULT 1 NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    country text NOT NULL,
    isolation text NOT NULL,
    evidence text NOT NULL,
    capacity integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT git_worker_capacity_check CHECK (((capacity >= 1) AND (capacity <= 32))),
    CONSTRAINT git_worker_isolation_check CHECK ((isolation = ANY (ARRAY['microvm'::text, 'artifact-only'::text])))
);


--
-- Name: hosting_agent; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_agent (
    cluster_id character varying NOT NULL,
    credential_hash text NOT NULL,
    generation integer NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    last_sequence bigint DEFAULT '-1'::integer NOT NULL,
    last_seen timestamp with time zone,
    observation jsonb,
    CONSTRAINT hosting_agent_generation_check CHECK ((generation > 0))
);


--
-- Name: hosting_app; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_app (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    project_id character varying NOT NULL,
    name text NOT NULL,
    spec jsonb NOT NULL,
    previous_spec jsonb,
    revision integer DEFAULT 1 NOT NULL,
    observed_revision integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    operation_id character varying,
    last_error text,
    logs text,
    observed_uid text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lifecycle text DEFAULT 'deployed'::text NOT NULL,
    observed_spec jsonb,
    environment_encrypted text,
    previous_environment_encrypted text,
    observed_environment_encrypted text,
    CONSTRAINT hosting_app_lifecycle_check CHECK ((lifecycle = ANY (ARRAY['draft'::text, 'deployed'::text])))
);


--
-- Name: hosting_audit; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_audit (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    subject text NOT NULL,
    action text NOT NULL,
    target_id text NOT NULL,
    outcome text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hosting_byok_policy; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_byok_policy (
    customer_id character varying NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    policy jsonb NOT NULL
);


--
-- Name: hosting_cluster; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_cluster (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    name text NOT NULL,
    provider text NOT NULL,
    country text,
    region text NOT NULL,
    location_evidence text NOT NULL,
    dedicated_customer_id character varying,
    revision integer DEFAULT 1 NOT NULL,
    generation integer DEFAULT 0 NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    capacity jsonb,
    verification_evidence text,
    ownership text DEFAULT 'platform'::text NOT NULL,
    cluster_uid text,
    inventory jsonb,
    scan_requested boolean DEFAULT false NOT NULL,
    CONSTRAINT hosting_cluster_generation_check CHECK ((generation >= 0)),
    CONSTRAINT hosting_cluster_revision_check CHECK ((revision > 0))
);


--
-- Name: hosting_database; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_database (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    project_id character varying NOT NULL,
    order_id character varying CONSTRAINT hosting_database_order_id_not_null1 NOT NULL,
    plan_revision_id character varying NOT NULL,
    backend_id character varying CONSTRAINT hosting_database_backend_id_not_null1 NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    database_name text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    observed_revision integer DEFAULT 0 NOT NULL,
    state text DEFAULT 'provisioning'::text NOT NULL,
    credential_revision integer DEFAULT 1 NOT NULL,
    credentials_encrypted text NOT NULL,
    confirmed_credential_revision integer DEFAULT 0 NOT NULL,
    confirmed_credentials_encrypted text,
    operation_id character varying,
    observed_at timestamp with time zone,
    usage jsonb,
    retained_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pending_plan_revision_id character varying,
    pending_order_id character varying,
    pending_backend_id character varying,
    CONSTRAINT hosting_database_kind_check CHECK ((kind = ANY (ARRAY['shared'::text, 'dedicated'::text]))),
    CONSTRAINT hosting_database_revision_check CHECK ((revision > 0)),
    CONSTRAINT hosting_database_state_check CHECK ((state = ANY (ARRAY['provisioning'::text, 'ready'::text, 'pausing'::text, 'paused'::text, 'resuming'::text, 'updating'::text, 'restoring'::text, 'degraded'::text, 'deleting'::text, 'retained'::text, 'purged'::text, 'needs-reconciliation'::text])))
);


--
-- Name: hosting_database_backend; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_database_backend (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    cluster_id character varying NOT NULL,
    kind text NOT NULL,
    node text NOT NULL,
    pool_id uuid NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    observed_revision integer DEFAULT 0 NOT NULL,
    state text DEFAULT 'provisioning'::text NOT NULL,
    cnpg_uid text,
    demand jsonb NOT NULL,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    max_databases integer NOT NULL,
    logical_capacity_bytes bigint NOT NULL,
    host text NOT NULL,
    direct_port integer NOT NULL,
    pooled_port integer NOT NULL,
    endpoint_ready boolean DEFAULT false NOT NULL,
    observed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ca_certificate text,
    filesystem_used_bytes bigint,
    CONSTRAINT hosting_database_backend_check CHECK ((direct_port <> pooled_port)),
    CONSTRAINT hosting_database_backend_direct_port_check CHECK (((direct_port >= 30000) AND (direct_port <= 32767))),
    CONSTRAINT hosting_database_backend_kind_check CHECK ((kind = ANY (ARRAY['shared-pool'::text, 'dedicated'::text]))),
    CONSTRAINT hosting_database_backend_logical_capacity_bytes_check CHECK ((logical_capacity_bytes >= 0)),
    CONSTRAINT hosting_database_backend_max_databases_check CHECK (((max_databases >= 1) AND (max_databases <= 100))),
    CONSTRAINT hosting_database_backend_pooled_port_check CHECK (((pooled_port >= 30000) AND (pooled_port <= 32767)))
);


--
-- Name: hosting_database_job; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_database_job (
    operation_id character varying NOT NULL,
    backend_id character varying NOT NULL,
    database_id character varying,
    action text NOT NULL,
    revision integer NOT NULL,
    lease_token_hash text,
    checkpoint jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source_backend_id character varying,
    migration_id character varying
);


--
-- Name: hosting_database_migration; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_database_migration (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    database_id character varying NOT NULL,
    source_backend_id character varying NOT NULL,
    target_backend_id character varying NOT NULL,
    target_order_id character varying NOT NULL,
    source_order_id character varying NOT NULL,
    source_plan_revision_id character varying NOT NULL,
    source_credential_revision integer NOT NULL,
    source_credentials_encrypted text CONSTRAINT hosting_database_migration_source_credentials_encrypte_not_null NOT NULL,
    transfer_credentials_encrypted text CONSTRAINT hosting_database_migration_transfer_credentials_encryp_not_null NOT NULL,
    source_allowance_bytes bigint DEFAULT 0 NOT NULL,
    state text DEFAULT 'preparing'::text NOT NULL,
    job_uid text,
    copy_sha256 text,
    retained_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hosting_database_migration_check CHECK (((source_backend_id)::text <> (target_backend_id)::text)),
    CONSTRAINT hosting_database_migration_state_check CHECK ((state = ANY (ARRAY['preparing'::text, 'copying'::text, 'retained'::text, 'needs-reconciliation'::text, 'purged'::text])))
);


--
-- Name: hosting_database_offer; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_database_offer (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    project_id character varying NOT NULL,
    plan_revision_id character varying NOT NULL,
    name text NOT NULL,
    snapshot jsonb NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hosting_database_order; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_database_order (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    offer_id character varying NOT NULL,
    customer_id character varying NOT NULL,
    project_id character varying NOT NULL,
    plan_revision_id character varying NOT NULL,
    accepted_by text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    snapshot jsonb NOT NULL,
    billing_started_at timestamp with time zone,
    cancellation_requested_at timestamp with time zone,
    ended_at timestamp with time zone,
    database_id character varying
);


--
-- Name: hosting_database_plan; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_database_plan (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    plan jsonb NOT NULL,
    availability text DEFAULT 'disabled'::text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hosting_database_plan_availability_check CHECK ((availability = ANY (ARRAY['disabled'::text, 'pilot'::text, 'public'::text]))),
    CONSTRAINT hosting_database_plan_revision_check CHECK ((revision > 0))
);


--
-- Name: hosting_database_pool; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_database_pool (
    cluster_id character varying NOT NULL,
    node text NOT NULL,
    pool_id uuid NOT NULL,
    capacity_bytes bigint NOT NULL,
    registered_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hosting_database_pool_capacity_bytes_check CHECK ((capacity_bytes > 0))
);


--
-- Name: hosting_database_port; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_database_port (
    cluster_id character varying NOT NULL,
    port integer NOT NULL,
    backend_id character varying NOT NULL,
    CONSTRAINT hosting_database_port_port_check CHECK (((port >= 30000) AND (port <= 32767)))
);


--
-- Name: hosting_database_preview; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_database_preview (
    database_id character varying NOT NULL,
    session_id text NOT NULL,
    kind text NOT NULL,
    plan_hash text NOT NULL,
    revision integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT hosting_database_preview_kind_check CHECK (((kind = ANY (ARRAY['delete'::text, 'purge'::text])) OR (kind ~ '^migration:[1-9][0-9]{0,18}$'::text)))
);


--
-- Name: hosting_enrollment; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_enrollment (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    cluster_id character varying NOT NULL,
    actor_id text NOT NULL,
    token_hash text,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    issued_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hosting_external_state; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_external_state (
    cluster_id character varying NOT NULL,
    uid text NOT NULL,
    previous_replicas integer NOT NULL
);


--
-- Name: hosting_limit; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_limit (
    customer_id character varying NOT NULL,
    scope text NOT NULL,
    "values" jsonb NOT NULL,
    revision integer NOT NULL,
    CONSTRAINT hosting_limit_revision_check CHECK ((revision > 0))
);


--
-- Name: hosting_operation; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_operation (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    subject text NOT NULL,
    customer_id character varying,
    project_id character varying,
    cluster_id character varying,
    action text NOT NULL,
    idempotency_key text NOT NULL,
    payload_hash text NOT NULL,
    status text NOT NULL,
    result jsonb,
    generation integer DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    app_id character varying,
    desired jsonb,
    target_revision integer,
    actor_session text,
    CONSTRAINT hosting_operation_generation_check CHECK ((generation >= 0)),
    CONSTRAINT hosting_operation_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'needs-reconciliation'::text])))
);


--
-- Name: hosting_project; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_project (
    project_id character varying NOT NULL,
    customer_id character varying NOT NULL,
    provider text NOT NULL,
    cluster_id character varying,
    namespace text,
    mode text NOT NULL,
    own_images boolean DEFAULT false NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    CONSTRAINT hosting_project_check CHECK ((((provider = 'k3s'::text) AND (cluster_id IS NOT NULL) AND (namespace IS NOT NULL)) OR ((provider = 'vercel'::text) AND (cluster_id IS NULL) AND (namespace IS NULL)))),
    CONSTRAINT hosting_project_mode_check CHECK ((mode = ANY (ARRAY['managed'::text, 'selfservice'::text]))),
    CONSTRAINT hosting_project_provider_check CHECK ((provider = ANY (ARRAY['k3s'::text, 'vercel'::text]))),
    CONSTRAINT hosting_project_revision_check CHECK ((revision > 0))
);


--
-- Name: hosting_rate; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_rate (
    key_hash text NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    requests integer DEFAULT 1 NOT NULL
);


--
-- Name: hosting_reservation; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_reservation (
    operation_id character varying NOT NULL,
    customer_id character varying NOT NULL,
    project_id character varying NOT NULL,
    cluster_id character varying NOT NULL,
    demand jsonb NOT NULL,
    status text NOT NULL,
    app_id character varying,
    CONSTRAINT hosting_reservation_status_check CHECK ((status = ANY (ARRAY['reserved'::text, 'active'::text, 'released'::text])))
);


--
-- Name: hosting_service_binding; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_service_binding (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    project_id character varying NOT NULL,
    app_id character varying NOT NULL,
    service jsonb NOT NULL,
    variable text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    observed_revision integer DEFAULT 0 NOT NULL,
    credential_revision integer,
    secret_encrypted text,
    state text DEFAULT 'pending'::text NOT NULL,
    reason text,
    operation_id character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    mail_key_id text,
    retiring_mail_key_id text,
    CONSTRAINT hosting_service_binding_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'connected'::text, 'blocked'::text, 'disconnecting'::text, 'disconnected'::text])))
);


--
-- Name: hosting_setup; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_setup (
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    project_id character varying NOT NULL,
    subject text NOT NULL,
    actor jsonb,
    configuration jsonb NOT NULL,
    environment_encrypted text,
    revision integer DEFAULT 1 NOT NULL,
    state text DEFAULT 'draft'::text NOT NULL,
    preview jsonb,
    confirmed_preview_id text,
    resources jsonb DEFAULT '{}'::jsonb NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    reason text,
    generation integer DEFAULT 0 NOT NULL,
    lease_until timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hosting_setup_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'awaiting-confirmation'::text, 'running'::text, 'blocked'::text, 'failed'::text, 'ready'::text])))
);


--
-- Name: hosting_turbosmtp; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_turbosmtp (
    customer_id character varying NOT NULL,
    label text NOT NULL,
    encrypted_secret text,
    credential_hash text,
    key_suffix text,
    revision integer DEFAULT 1 NOT NULL,
    snapshot jsonb DEFAULT '[]'::jsonb NOT NULL,
    checked_at timestamp with time zone,
    pending_domain text,
    operation_token text,
    state text DEFAULT 'ready'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hosting_vercel; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_vercel (
    customer_id character varying NOT NULL,
    team_id text NOT NULL,
    configuration_id text NOT NULL,
    encrypted_token text NOT NULL,
    projects jsonb DEFAULT '[]'::jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hosting_vercel_flow; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.hosting_vercel_flow (
    state_hash text NOT NULL,
    customer_id character varying NOT NULL,
    subject text NOT NULL,
    session_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed boolean DEFAULT false NOT NULL
);


--
-- Name: invitation; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.invitation (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    "organizationId" text NOT NULL,
    email text NOT NULL,
    role text,
    status text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "inviterId" text NOT NULL
);


--
-- Name: jwks; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.jwks (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    "publicKey" text NOT NULL,
    "privateKey" text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "expiresAt" timestamp with time zone,
    alg text,
    crv text
);


--
-- Name: mail_api_key; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_api_key (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    key_hash text NOT NULL,
    permission text NOT NULL,
    domain_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    last_used_at timestamp with time zone,
    CONSTRAINT mail_api_key_permission_check CHECK ((permission = ANY (ARRAY['sending_access'::text, 'full_access'::text])))
);


--
-- Name: mail_batch; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_batch (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    failed_index integer,
    failed_email_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    claim_token uuid,
    lease_until timestamp with time zone,
    CONSTRAINT mail_batch_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'succeeded'::text, 'failed'::text])))
);


--
-- Name: mail_batch_item; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_batch_item (
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    batch_id text NOT NULL,
    item_index integer NOT NULL,
    message_id text,
    status text NOT NULL,
    result jsonb,
    CONSTRAINT mail_batch_item_item_index_check CHECK (((item_index >= 0) AND (item_index < 100))),
    CONSTRAINT mail_batch_item_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'failed'::text, 'not_sent'::text])))
);


--
-- Name: mail_callback_inbox; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_callback_inbox (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    source_id text NOT NULL,
    payload jsonb NOT NULL,
    dedupe_key text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    claim_token uuid,
    lease_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    CONSTRAINT mail_callback_inbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'quarantined'::text])))
);


--
-- Name: mail_callback_source; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_callback_source (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    secret_hash text NOT NULL,
    kind text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    verified_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    rate_window timestamp with time zone,
    rate_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT mail_callback_source_kind_check CHECK ((kind = ANY (ARRAY['account'::text, 'parent'::text])))
);


--
-- Name: mail_callback_source_connection; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_callback_source_connection (
    source_id text NOT NULL,
    connection_id text NOT NULL
);


--
-- Name: mail_connection; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_connection (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    kind text NOT NULL,
    provider_account_id text NOT NULL,
    region text DEFAULT 'eu'::text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mail_connection_kind_check CHECK ((kind = ANY (ARRAY['platform'::text, 'byok'::text]))),
    CONSTRAINT mail_connection_region_check CHECK ((region = ANY (ARRAY['eu'::text, 'global'::text]))),
    CONSTRAINT mail_connection_revision_check CHECK ((revision > 0)),
    CONSTRAINT mail_connection_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'ready'::text, 'paused'::text, 'needs_review'::text, 'disconnected'::text])))
);


--
-- Name: mail_connection_domain; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_connection_domain (
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    domain_id text NOT NULL,
    provider_id text,
    provider_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    provider_operation text,
    provider_checked_at timestamp with time zone
);


--
-- Name: mail_connection_secret; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_connection_secret (
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    version integer NOT NULL,
    encrypted_secret text NOT NULL,
    key_suffix text NOT NULL,
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT mail_connection_secret_version_check CHECK ((version > 0))
);


--
-- Name: mail_connection_tracking_settings; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_connection_tracking_settings (
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    snapshot jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mail_event; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_event (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    resource_id text NOT NULL,
    message_id text,
    recipient text,
    type text NOT NULL,
    source text NOT NULL,
    dedupe_key text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mail_idempotency; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_idempotency (
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    key text NOT NULL,
    method text NOT NULL,
    path text NOT NULL,
    body_hash text NOT NULL,
    status text NOT NULL,
    response_status integer,
    response_body jsonb,
    message_id text,
    batch_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    operation_token uuid DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT mail_idempotency_check CHECK (((status = 'completed'::text) OR (expires_at IS NULL))),
    CONSTRAINT mail_idempotency_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'unknown'::text, 'completed'::text])))
);


--
-- Name: mail_import_map; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_import_map (
    source text NOT NULL,
    kind text NOT NULL,
    legacy_id text NOT NULL,
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    target_id text NOT NULL,
    checksum text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mail_job_lease; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_job_lease (
    name text NOT NULL,
    claim_token uuid NOT NULL,
    lease_until timestamp with time zone NOT NULL,
    cursor text
);


--
-- Name: mail_job_run; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_job_run (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    name text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text NOT NULL,
    counts jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: mail_message; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_message (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    domain_id text NOT NULL,
    principal jsonb DEFAULT '{}'::jsonb NOT NULL,
    from_address text NOT NULL,
    subject text NOT NULL,
    dispatch_status text NOT NULL,
    scheduled_at timestamp with time zone,
    accepted_at timestamp with time zone,
    terminal_at timestamp with time zone,
    provider_mid text,
    provider_reference uuid NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    simulated boolean DEFAULT false NOT NULL,
    error_code text,
    claim_token uuid,
    lease_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    handoff_started_at timestamp with time zone,
    blocked_reason text,
    CONSTRAINT mail_message_dispatch_status_check CHECK ((dispatch_status = ANY (ARRAY['scheduled'::text, 'dispatching'::text, 'accepted'::text, 'failed'::text, 'outcome_unknown'::text, 'canceled'::text, 'suppressed'::text])))
);


--
-- Name: mail_message_content; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_message_content (
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    message_id text NOT NULL,
    text_body text,
    html_body text,
    headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    reply_to jsonb DEFAULT '[]'::jsonb NOT NULL,
    attachment_metadata jsonb DEFAULT '[]'::jsonb NOT NULL,
    encrypted_attachments text,
    expires_at timestamp with time zone
);


--
-- Name: mail_provider_operation; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_provider_operation (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    label text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mail_provider_operation_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'needs_review'::text, 'succeeded'::text])))
);


--
-- Name: mail_rate_window; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_rate_window (
    customer_id character varying NOT NULL,
    kind text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    count integer NOT NULL,
    CONSTRAINT mail_rate_window_count_check CHECK ((count >= 0))
);


--
-- Name: mail_recipient; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_recipient (
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    message_id text NOT NULL,
    email text NOT NULL,
    category text NOT NULL,
    suppression_reason text,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    complained_at timestamp with time zone,
    unsubscribed_at timestamp with time zone,
    first_open_at timestamp with time zone,
    last_open_at timestamp with time zone,
    first_click_at timestamp with time zone,
    last_click_at timestamp with time zone,
    first_delivered_at timestamp with time zone,
    included_in_handoff boolean DEFAULT false NOT NULL,
    CONSTRAINT mail_recipient_category_check CHECK ((category = ANY (ARRAY['to'::text, 'cc'::text, 'bcc'::text]))),
    CONSTRAINT mail_recipient_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'deferred'::text, 'delivered'::text, 'bounced'::text, 'failed'::text, 'suppressed'::text])))
);


--
-- Name: mail_request_log; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_request_log (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    key_id text,
    route text NOT NULL,
    method text NOT NULL,
    status integer NOT NULL,
    duration_ms integer NOT NULL,
    request_id text NOT NULL,
    request_body jsonb,
    response_body jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mail_sender_domain; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_sender_domain (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id text NOT NULL,
    domain text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    checked_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_id text,
    provider_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    provider_checked_at timestamp with time zone,
    provider_operation text,
    provider_operation_started_at timestamp with time zone,
    CONSTRAINT mail_sender_domain_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'ownership_verified'::text])))
);


--
-- Name: mail_suppression; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_suppression (
    customer_id character varying NOT NULL,
    email text NOT NULL,
    reason text NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mail_suppression_reason_check CHECK ((reason = ANY (ARRAY['manual'::text, 'bounced'::text, 'complained'::text, 'unsubscribed'::text])))
);


--
-- Name: mail_tenant_account; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_tenant_account (
    customer_id text NOT NULL,
    provider_id text,
    email text NOT NULL,
    encrypted_password text,
    state text NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mail_tenant_account_state_check CHECK ((state = ANY (ARRAY['provisioning'::text, 'ready'::text, 'needs_review'::text])))
);


--
-- Name: mail_tracking_domain; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_tracking_domain (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id text NOT NULL,
    sender_domain_id text NOT NULL,
    domain text NOT NULL,
    provider_id text,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    connection_id text
);


--
-- Name: mail_tracking_operation; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_tracking_operation (
    customer_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: mail_tracking_settings; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_tracking_settings (
    customer_id text NOT NULL,
    snapshot jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mail_usage_period; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_usage_period (
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    period date NOT NULL,
    budget bigint,
    reserved bigint DEFAULT 0 NOT NULL,
    consumed bigint DEFAULT 0 NOT NULL,
    CONSTRAINT mail_usage_period_budget_check CHECK ((budget >= 0)),
    CONSTRAINT mail_usage_period_consumed_check CHECK ((consumed >= 0)),
    CONSTRAINT mail_usage_period_reserved_check CHECK ((reserved >= 0))
);


--
-- Name: mail_usage_reservation; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_usage_reservation (
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    message_id text NOT NULL,
    period date NOT NULL,
    recipients integer NOT NULL,
    status text NOT NULL,
    CONSTRAINT mail_usage_reservation_recipients_check CHECK (((recipients > 0) AND (recipients <= 50))),
    CONSTRAINT mail_usage_reservation_status_check CHECK ((status = ANY (ARRAY['reserved'::text, 'consumed'::text, 'released'::text])))
);


--
-- Name: mail_webhook; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_webhook (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    url text NOT NULL,
    events jsonb NOT NULL,
    encrypted_secret text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mail_webhook_attempt; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_webhook_attempt (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    delivery_id text NOT NULL,
    http_status integer,
    response text,
    error_code text,
    duration_ms integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mail_webhook_delivery; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.mail_webhook_delivery (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    connection_id text NOT NULL,
    webhook_id text NOT NULL,
    event_id text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_at timestamp with time zone DEFAULT now() NOT NULL,
    claim_token uuid,
    lease_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT mail_webhook_delivery_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'delivering'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text])))
);


--
-- Name: managed_database_launch; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.managed_database_launch (
    token_hash text NOT NULL,
    database_id character varying NOT NULL,
    backend_id character varying NOT NULL,
    database_revision integer NOT NULL,
    credential_revision integer NOT NULL,
    subject text NOT NULL,
    session_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone
);


--
-- Name: managed_database_session; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.managed_database_session (
    token_hash text NOT NULL,
    id character varying DEFAULT webdock_auth.next_snowflake() NOT NULL,
    database_id character varying NOT NULL,
    backend_id character varying NOT NULL,
    database_revision integer NOT NULL,
    credential_revision integer NOT NULL,
    subject text NOT NULL,
    session_id text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: member; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.member (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    role text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL
);


--
-- Name: oauthAccessToken; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth."oauthAccessToken" (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    token text NOT NULL,
    "clientId" text NOT NULL,
    "sessionId" text,
    "userId" text,
    "referenceId" text,
    "authorizationCodeId" text,
    resources jsonb,
    "requestedUserInfoClaims" jsonb,
    "refreshId" text,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    revoked timestamp with time zone,
    confirmation jsonb,
    scopes jsonb NOT NULL
);


--
-- Name: oauthClient; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth."oauthClient" (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    "clientId" text NOT NULL,
    "clientSecret" text,
    "clientDiscoveryId" text,
    disabled boolean,
    "skipConsent" boolean,
    "enableEndSession" boolean,
    "subjectType" text,
    scopes jsonb,
    "clientCredentialsScopes" jsonb,
    "userId" text,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone,
    name text,
    uri text,
    icon text,
    contacts jsonb,
    tos text,
    policy text,
    "softwareId" text,
    "softwareVersion" text,
    "softwareStatement" text,
    "redirectUris" jsonb NOT NULL,
    "postLogoutRedirectUris" jsonb,
    "backchannelLogoutUri" text,
    "backchannelLogoutSessionRequired" boolean,
    "tokenEndpointAuthMethod" text,
    "applicationType" text,
    jwks text,
    "jwksUri" text,
    "grantTypes" jsonb,
    "responseTypes" jsonb,
    "requirePKCE" boolean,
    "dpopBoundAccessTokens" boolean,
    "referenceId" text,
    metadata jsonb
);


--
-- Name: oauthClientAssertion; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth."oauthClientAssertion" (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL
);


--
-- Name: oauthClientResource; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth."oauthClientResource" (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    "clientId" text NOT NULL,
    "resourceId" text NOT NULL,
    metadata jsonb,
    "createdAt" timestamp with time zone
);


--
-- Name: oauthConsent; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth."oauthConsent" (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    "clientId" text NOT NULL,
    "userId" text,
    "referenceId" text,
    resources jsonb,
    "requestedUserInfoClaims" jsonb,
    scopes jsonb NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: oauthRefreshToken; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth."oauthRefreshToken" (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    token text NOT NULL,
    "clientId" text NOT NULL,
    "sessionId" text,
    "userId" text NOT NULL,
    "referenceId" text,
    "authorizationCodeId" text,
    resources jsonb,
    "requestedUserInfoClaims" jsonb,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    revoked timestamp with time zone,
    "rotatedAt" timestamp with time zone,
    "rotationReplayResponse" text,
    "rotationReplayExpiresAt" timestamp with time zone,
    "authTime" timestamp with time zone,
    confirmation jsonb,
    scopes jsonb NOT NULL
);


--
-- Name: oauthResource; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth."oauthResource" (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    "accessTokenTtl" integer,
    "refreshTokenTtl" integer,
    "signingAlgorithm" text,
    "signingKeyId" text,
    "allowedScopes" jsonb,
    "customClaims" jsonb,
    "dpopBoundAccessTokensRequired" boolean,
    disabled boolean,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone,
    "policyVersion" integer,
    metadata jsonb
);


--
-- Name: organization; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.organization (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo text,
    "createdAt" timestamp with time zone NOT NULL,
    metadata text
);


--
-- Name: passkey; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.passkey (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    name text,
    "publicKey" text NOT NULL,
    "userId" text NOT NULL,
    "credentialID" text NOT NULL,
    counter integer NOT NULL,
    "deviceType" text NOT NULL,
    "backedUp" boolean NOT NULL,
    transports text,
    "createdAt" timestamp with time zone,
    aaguid text
);


--
-- Name: plan_offer; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.plan_offer (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id character varying NOT NULL,
    plan_id text,
    token_hash text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    terms text NOT NULL,
    base jsonb NOT NULL,
    offered_extras jsonb NOT NULL,
    expected_revision integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by text,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_offer_expected_revision_check CHECK ((expected_revision >= 0)),
    CONSTRAINT plan_offer_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text])))
);


--
-- Name: plan_template; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.plan_template (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    allowances jsonb NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_mail_credential; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.platform_mail_credential (
    id boolean DEFAULT true NOT NULL,
    encrypted_secret text NOT NULL,
    key_suffix text NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_mail_credential_id_check CHECK (id)
);


--
-- Name: platform_settings; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.platform_settings (
    id boolean DEFAULT true NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_settings_id_check CHECK (id)
);


--
-- Name: project_grant; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.project_grant (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    user_id text NOT NULL,
    binding_id text NOT NULL,
    organization_id text NOT NULL,
    role text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT project_grant_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'editor'::text, 'reader'::text])))
);


--
-- Name: rateLimit; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth."rateLimit" (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    key text NOT NULL,
    count integer NOT NULL,
    "lastRequest" bigint NOT NULL
);


--
-- Name: session; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.session (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL,
    "impersonatedBy" text,
    "activeOrganizationId" text
);


--
-- Name: snowflake_state; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.snowflake_state (
    singleton boolean DEFAULT true NOT NULL,
    last_ms bigint DEFAULT 0 NOT NULL,
    sequence integer DEFAULT '-1'::integer NOT NULL,
    CONSTRAINT snowflake_state_sequence_check CHECK (((sequence >= '-1'::integer) AND (sequence <= 4095))),
    CONSTRAINT snowflake_state_singleton_check CHECK (singleton)
);


--
-- Name: studio_tenant_preview; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.studio_tenant_preview (
    session_id text NOT NULL,
    actor_id text NOT NULL,
    customer_id character varying NOT NULL,
    organization_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
    expired_at timestamp with time zone
);


--
-- Name: subscription_history; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.subscription_history (
    customer_id character varying NOT NULL,
    revision integer NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    base jsonb NOT NULL,
    extras jsonb NOT NULL,
    plan_id text,
    actor_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscription_history_revision_check CHECK ((revision > 0))
);


--
-- Name: tenant_customer; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.tenant_customer (
    customer_id character varying NOT NULL,
    organization_id text NOT NULL
);


--
-- Name: tenant_storage; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.tenant_storage (
    id text NOT NULL,
    customer_id text NOT NULL,
    label text NOT NULL,
    environment text NOT NULL,
    store_id text NOT NULL,
    prefix text NOT NULL,
    encrypted_token text NOT NULL,
    bytes bigint,
    objects integer,
    checked_at timestamp with time zone,
    last_attempt_at timestamp with time zone,
    error text,
    revision bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_storage_bytes_check CHECK (((bytes >= 0) AND (bytes <= '9007199254740991'::bigint))),
    CONSTRAINT tenant_storage_environment_check CHECK ((environment = ANY (ARRAY['production'::text, 'preview'::text]))),
    CONSTRAINT tenant_storage_objects_check CHECK ((objects >= 0))
);


--
-- Name: tenant_subscription; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.tenant_subscription (
    customer_id character varying NOT NULL,
    plan_id text,
    name text NOT NULL,
    description text NOT NULL,
    base jsonb NOT NULL,
    extras jsonb NOT NULL,
    revision integer NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_subscription_revision_check CHECK ((revision > 0))
);


--
-- Name: twoFactor; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth."twoFactor" (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    secret text NOT NULL,
    "backupCodes" text NOT NULL,
    "userId" text NOT NULL,
    verified boolean,
    "failedVerificationCount" integer,
    "lockedUntil" timestamp with time zone
);


--
-- Name: user; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth."user" (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    role text,
    banned boolean,
    "banReason" text,
    "banExpires" timestamp with time zone,
    "twoFactorEnabled" boolean,
    "mustChangePassword" boolean NOT NULL
);


--
-- Name: verification; Type: TABLE; Schema: webdock_auth; Owner: -
--

CREATE TABLE webdock_auth.verification (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: access_event; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.access_event (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id text NOT NULL,
    subject text NOT NULL,
    action text NOT NULL,
    target_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_key; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.api_key (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id text NOT NULL,
    label text NOT NULL,
    token_hash text NOT NULL,
    key_suffix text NOT NULL,
    domain_restricted boolean DEFAULT false NOT NULL,
    domain_id text,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: budget_reservation; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.budget_reservation (
    reference_id text NOT NULL,
    customer_id text NOT NULL,
    period_start date NOT NULL,
    units integer NOT NULL,
    state text DEFAULT 'reserved'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settled_at timestamp with time zone,
    send_path jsonb,
    CONSTRAINT budget_reservation_state_check CHECK ((state = ANY (ARRAY['reserved'::text, 'accepted'::text, 'released'::text]))),
    CONSTRAINT budget_reservation_units_check CHECK (((units >= 1) AND (units <= 100)))
);


--
-- Name: cluster_reservation; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.cluster_reservation (
    customer_id text NOT NULL,
    cluster_id character varying NOT NULL,
    demand jsonb NOT NULL,
    status text NOT NULL,
    CONSTRAINT cluster_reservation_status_check CHECK ((status = ANY (ARRAY['reserved'::text, 'active'::text])))
);


--
-- Name: configuration; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.configuration (
    customer_id text NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    applied_revision bigint DEFAULT 0 NOT NULL
);


--
-- Name: configuration_operation; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.configuration_operation (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id text NOT NULL,
    revision bigint NOT NULL,
    requested_by text,
    state text DEFAULT 'pending'::text NOT NULL,
    lease_token text,
    lease_until timestamp with time zone,
    agent_generation integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    reason text DEFAULT 'management'::text NOT NULL,
    desired jsonb,
    CONSTRAINT configuration_operation_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'superseded'::text, 'needs_review'::text])))
);


--
-- Name: domain; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.domain (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id text NOT NULL,
    sender_domain_id text NOT NULL,
    name text NOT NULL,
    provider_id text,
    state text DEFAULT 'pending'::text NOT NULL,
    dkim_keys jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT domain_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'ready'::text, 'needs_review'::text])))
);


--
-- Name: identity; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.identity (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id text NOT NULL,
    subject text NOT NULL,
    provider_id text,
    encrypted_credentials text,
    state text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT identity_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'ready'::text, 'needs_review'::text])))
);


--
-- Name: instance; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.instance (
    customer_id text NOT NULL,
    internal_url text,
    public_url text,
    encrypted_credentials text NOT NULL,
    verified_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    smtp_certificate_sha256 text,
    smtp_certificate_revision bigint,
    submission_resource_ids jsonb,
    submission_state text,
    encrypted_submission_credentials text,
    submission_hook_token_hash text,
    submission_transport_revision bigint,
    submission_ready_revision bigint
);


--
-- Name: mailbox; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.mailbox (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id text NOT NULL,
    domain_id text NOT NULL,
    local_part text NOT NULL,
    name text NOT NULL,
    quota_bytes bigint NOT NULL,
    provider_id text,
    state text DEFAULT 'pending'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT mailbox_quota_bytes_check CHECK (((quota_bytes >= 1048576) AND (quota_bytes <= '1099511627776'::bigint))),
    CONSTRAINT mailbox_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'ready'::text, 'needs_review'::text])))
);


--
-- Name: mailbox_grant; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.mailbox_grant (
    customer_id text NOT NULL,
    mailbox_id text NOT NULL,
    subject text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    member_id text,
    operator_grant boolean DEFAULT false NOT NULL,
    applied_revision bigint DEFAULT 0 NOT NULL
);


--
-- Name: month_usage; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.month_usage (
    customer_id text NOT NULL,
    period_start date NOT NULL,
    reserved bigint DEFAULT 0 NOT NULL,
    accepted bigint DEFAULT 0 NOT NULL,
    CONSTRAINT month_usage_accepted_check CHECK ((accepted >= 0)),
    CONSTRAINT month_usage_reserved_check CHECK ((reserved >= 0))
);


--
-- Name: operation; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.operation (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id text NOT NULL,
    revision bigint NOT NULL,
    desired_enabled boolean NOT NULL,
    requested_by text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    lease_token text,
    lease_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    agent_generation integer,
    CONSTRAINT operation_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'superseded'::text, 'needs_review'::text])))
);


--
-- Name: send_job; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.send_job (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id text NOT NULL,
    source_id text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    payload_ref uuid NOT NULL,
    payload_bytes integer NOT NULL,
    route jsonb NOT NULL,
    envelope jsonb DEFAULT '{}'::jsonb NOT NULL,
    state text DEFAULT 'queued'::text NOT NULL,
    not_before timestamp with time zone DEFAULT now() NOT NULL,
    lease_token uuid,
    lease_until timestamp with time zone,
    provider_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    payload_format text DEFAULT 'request'::text NOT NULL,
    source_context jsonb DEFAULT '{}'::jsonb NOT NULL,
    filing_state text,
    payload_deleted_at timestamp with time zone,
    message_digest text,
    submission_gate_queue_id text,
    CONSTRAINT send_job_payload_bytes_check CHECK (((payload_bytes >= 1) AND (payload_bytes <= 26214400))),
    CONSTRAINT send_job_payload_format_check CHECK ((payload_format = ANY (ARRAY['request'::text, 'mime'::text]))),
    CONSTRAINT send_job_state_check CHECK ((state = ANY (ARRAY['staging'::text, 'queued'::text, 'leased'::text, 'preparation_review'::text, 'handoff'::text, 'accepted'::text, 'rejected'::text, 'cancelled'::text, 'unknown'::text])))
);


--
-- Name: send_transport; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.send_transport (
    customer_id text NOT NULL,
    mode text NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    state text NOT NULL,
    region text NOT NULL,
    provider_account_id text,
    encrypted_credentials text,
    byok_revision integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pending_token uuid,
    CONSTRAINT send_transport_mode_check CHECK ((mode = ANY (ARRAY['managed'::text, 'byok'::text]))),
    CONSTRAINT send_transport_region_check CHECK ((region = ANY (ARRAY['eu'::text, 'global'::text]))),
    CONSTRAINT send_transport_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'ready'::text, 'needs_review'::text, 'disabled'::text])))
);


--
-- Name: service; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.service (
    customer_id text NOT NULL,
    instance_key text NOT NULL,
    host_id text NOT NULL,
    desired_enabled boolean DEFAULT false NOT NULL,
    state text NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    applied_revision bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_revision_check CHECK ((revision > 0)),
    CONSTRAINT service_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'provisioning'::text, 'ready'::text, 'suspended'::text, 'needs_review'::text])))
);


--
-- Name: webmail_launch; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.webmail_launch (
    token_hash text NOT NULL,
    customer_id text NOT NULL,
    mailbox_id text NOT NULL,
    subject text NOT NULL,
    session_id text NOT NULL,
    grant_revision bigint NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone
);


--
-- Name: webmail_session; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.webmail_session (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    token_hash text NOT NULL,
    customer_id text NOT NULL,
    mailbox_id text NOT NULL,
    subject text NOT NULL,
    session_id text NOT NULL,
    grant_revision bigint NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: webmail_write; Type: TABLE; Schema: webdock_mail; Owner: -
--

CREATE TABLE webdock_mail.webmail_write (
    id text DEFAULT webdock_auth.next_snowflake() NOT NULL,
    customer_id text NOT NULL,
    mailbox_id text NOT NULL,
    subject text NOT NULL,
    request_id uuid NOT NULL,
    action text NOT NULL,
    resource_id text,
    payload_hash text NOT NULL,
    lease_token uuid NOT NULL,
    state text DEFAULT 'reserved'::text NOT NULL,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    queue_preparing_until timestamp with time zone,
    CONSTRAINT webmail_write_action_check CHECK ((action = ANY (ARRAY['draft'::text, 'submit'::text, 'update'::text]))),
    CONSTRAINT webmail_write_state_check CHECK ((state = ANY (ARRAY['reserved'::text, 'succeeded'::text, 'rejected'::text, 'uncertain'::text])))
);


--
-- Name: payload_kv id; Type: DEFAULT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_kv ALTER COLUMN id SET DEFAULT nextval('webdock_admin.payload_kv_id_seq'::regclass);


--
-- Name: payload_locked_documents id; Type: DEFAULT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_locked_documents ALTER COLUMN id SET DEFAULT nextval('webdock_admin.payload_locked_documents_id_seq'::regclass);


--
-- Name: payload_locked_documents_rels id; Type: DEFAULT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_locked_documents_rels ALTER COLUMN id SET DEFAULT nextval('webdock_admin.payload_locked_documents_rels_id_seq'::regclass);


--
-- Name: payload_migrations id; Type: DEFAULT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_migrations ALTER COLUMN id SET DEFAULT nextval('webdock_admin.payload_migrations_id_seq'::regclass);


--
-- Name: payload_preferences id; Type: DEFAULT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_preferences ALTER COLUMN id SET DEFAULT nextval('webdock_admin.payload_preferences_id_seq'::regclass);


--
-- Name: payload_preferences_rels id; Type: DEFAULT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_preferences_rels ALTER COLUMN id SET DEFAULT nextval('webdock_admin.payload_preferences_rels_id_seq'::regclass);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: cms_instances cms_instances_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.cms_instances
    ADD CONSTRAINT cms_instances_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: payload_kv payload_kv_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_kv
    ADD CONSTRAINT payload_kv_pkey PRIMARY KEY (id);


--
-- Name: payload_locked_documents payload_locked_documents_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_locked_documents
    ADD CONSTRAINT payload_locked_documents_pkey PRIMARY KEY (id);


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_pkey PRIMARY KEY (id);


--
-- Name: payload_migrations payload_migrations_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_migrations
    ADD CONSTRAINT payload_migrations_pkey PRIMARY KEY (id);


--
-- Name: payload_preferences payload_preferences_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_preferences
    ADD CONSTRAINT payload_preferences_pkey PRIMARY KEY (id);


--
-- Name: payload_preferences_rels payload_preferences_rels_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_pkey PRIMARY KEY (id);


--
-- Name: project_deletion project_deletion_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.project_deletion
    ADD CONSTRAINT project_deletion_pkey PRIMARY KEY (project_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: snowflake_state snowflake_state_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.snowflake_state
    ADD CONSTRAINT snowflake_state_pkey PRIMARY KEY (singleton);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users_sessions users_sessions_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.users_sessions
    ADD CONSTRAINT users_sessions_pkey PRIMARY KEY (id);


--
-- Name: vercel_connection vercel_connection_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.vercel_connection
    ADD CONSTRAINT vercel_connection_pkey PRIMARY KEY (team_id);


--
-- Name: vercel_project_link vercel_project_link_pkey; Type: CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.vercel_project_link
    ADD CONSTRAINT vercel_project_link_pkey PRIMARY KEY (project_id);


--
-- Name: access_event access_event_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.access_event
    ADD CONSTRAINT access_event_pkey PRIMARY KEY (id);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: app_binding app_binding_client_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.app_binding
    ADD CONSTRAINT app_binding_client_id_key UNIQUE (client_id);


--
-- Name: app_binding app_binding_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.app_binding
    ADD CONSTRAINT app_binding_pkey PRIMARY KEY (id);


--
-- Name: database_audit database_audit_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_audit
    ADD CONSTRAINT database_audit_pkey PRIMARY KEY (id);


--
-- Name: database_binding database_binding_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_binding
    ADD CONSTRAINT database_binding_pkey PRIMARY KEY (id);


--
-- Name: database_grant database_grant_binding_id_subject_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_grant
    ADD CONSTRAINT database_grant_binding_id_subject_key UNIQUE (binding_id, subject);


--
-- Name: database_grant database_grant_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_grant
    ADD CONSTRAINT database_grant_pkey PRIMARY KEY (id);


--
-- Name: database_grant database_grant_runtime_origin_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_grant
    ADD CONSTRAINT database_grant_runtime_origin_key UNIQUE (runtime_origin);


--
-- Name: database_launch database_launch_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_launch
    ADD CONSTRAINT database_launch_pkey PRIMARY KEY (token_hash);


--
-- Name: database_runtime_owner database_runtime_owner_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_runtime_owner
    ADD CONSTRAINT database_runtime_owner_pkey PRIMARY KEY (runtime_origin);


--
-- Name: database_session database_session_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_session
    ADD CONSTRAINT database_session_id_key UNIQUE (id);


--
-- Name: database_session database_session_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_session
    ADD CONSTRAINT database_session_pkey PRIMARY KEY (token_hash);


--
-- Name: git_artifact git_artifact_build_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_artifact
    ADD CONSTRAINT git_artifact_build_id_key UNIQUE (build_id);


--
-- Name: git_artifact git_artifact_id_customer_id_project_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_artifact
    ADD CONSTRAINT git_artifact_id_customer_id_project_id_key UNIQUE (id, customer_id, project_id);


--
-- Name: git_artifact git_artifact_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_artifact
    ADD CONSTRAINT git_artifact_pkey PRIMARY KEY (id);


--
-- Name: git_artifact git_artifact_storage_key_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_artifact
    ADD CONSTRAINT git_artifact_storage_key_key UNIQUE (storage_key);


--
-- Name: git_build git_build_id_customer_id_project_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_build
    ADD CONSTRAINT git_build_id_customer_id_project_id_key UNIQUE (id, customer_id, project_id);


--
-- Name: git_build git_build_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_build
    ADD CONSTRAINT git_build_pkey PRIMARY KEY (id);


--
-- Name: git_build git_build_project_id_idempotency_key_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_build
    ADD CONSTRAINT git_build_project_id_idempotency_key_key UNIQUE (project_id, idempotency_key);


--
-- Name: git_check_outbox git_check_outbox_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_check_outbox
    ADD CONSTRAINT git_check_outbox_pkey PRIMARY KEY (build_id);


--
-- Name: git_connection git_connection_id_customer_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_connection
    ADD CONSTRAINT git_connection_id_customer_id_key UNIQUE (id, customer_id);


--
-- Name: git_connection git_connection_installation_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_connection
    ADD CONSTRAINT git_connection_installation_id_key UNIQUE (installation_id);


--
-- Name: git_connection git_connection_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_connection
    ADD CONSTRAINT git_connection_pkey PRIMARY KEY (id);


--
-- Name: git_flow git_flow_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_flow
    ADD CONSTRAINT git_flow_pkey PRIMARY KEY (state_hash);


--
-- Name: git_receipt git_receipt_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_receipt
    ADD CONSTRAINT git_receipt_pkey PRIMARY KEY (delivery_id);


--
-- Name: git_release git_release_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_release
    ADD CONSTRAINT git_release_pkey PRIMARY KEY (id);


--
-- Name: git_release git_release_project_id_idempotency_key_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_release
    ADD CONSTRAINT git_release_project_id_idempotency_key_key UNIQUE (project_id, idempotency_key);


--
-- Name: git_repository git_repository_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_repository
    ADD CONSTRAINT git_repository_pkey PRIMARY KEY (connection_id, repository_id);


--
-- Name: git_source git_source_id_customer_id_project_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_source
    ADD CONSTRAINT git_source_id_customer_id_project_id_key UNIQUE (id, customer_id, project_id);


--
-- Name: git_source git_source_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_source
    ADD CONSTRAINT git_source_pkey PRIMARY KEY (id);


--
-- Name: git_vercel_target git_vercel_target_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_vercel_target
    ADD CONSTRAINT git_vercel_target_pkey PRIMARY KEY (project_id, target_id);


--
-- Name: git_vercel_target git_vercel_target_team_id_target_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_vercel_target
    ADD CONSTRAINT git_vercel_target_team_id_target_id_key UNIQUE (team_id, target_id);


--
-- Name: git_worker git_worker_credential_hash_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_worker
    ADD CONSTRAINT git_worker_credential_hash_key UNIQUE (credential_hash);


--
-- Name: git_worker git_worker_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_worker
    ADD CONSTRAINT git_worker_pkey PRIMARY KEY (id);


--
-- Name: hosting_agent hosting_agent_credential_hash_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_agent
    ADD CONSTRAINT hosting_agent_credential_hash_key UNIQUE (credential_hash);


--
-- Name: hosting_agent hosting_agent_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_agent
    ADD CONSTRAINT hosting_agent_pkey PRIMARY KEY (cluster_id);


--
-- Name: hosting_app hosting_app_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_app
    ADD CONSTRAINT hosting_app_pkey PRIMARY KEY (id);


--
-- Name: hosting_audit hosting_audit_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_audit
    ADD CONSTRAINT hosting_audit_pkey PRIMARY KEY (id);


--
-- Name: hosting_byok_policy hosting_byok_policy_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_byok_policy
    ADD CONSTRAINT hosting_byok_policy_pkey PRIMARY KEY (customer_id);


--
-- Name: hosting_cluster hosting_cluster_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_cluster
    ADD CONSTRAINT hosting_cluster_pkey PRIMARY KEY (id);


--
-- Name: hosting_database_backend hosting_database_backend_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_backend
    ADD CONSTRAINT hosting_database_backend_pkey PRIMARY KEY (id);


--
-- Name: hosting_database hosting_database_database_name_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_database_name_key UNIQUE (database_name);


--
-- Name: hosting_database_job hosting_database_job_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_job
    ADD CONSTRAINT hosting_database_job_pkey PRIMARY KEY (operation_id);


--
-- Name: hosting_database_migration hosting_database_migration_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_migration
    ADD CONSTRAINT hosting_database_migration_pkey PRIMARY KEY (id);


--
-- Name: hosting_database_migration hosting_database_migration_target_order_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_migration
    ADD CONSTRAINT hosting_database_migration_target_order_id_key UNIQUE (target_order_id);


--
-- Name: hosting_database_offer hosting_database_offer_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_offer
    ADD CONSTRAINT hosting_database_offer_pkey PRIMARY KEY (id);


--
-- Name: hosting_database hosting_database_order_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_order_id_key UNIQUE (order_id);


--
-- Name: hosting_database_order hosting_database_order_offer_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_order
    ADD CONSTRAINT hosting_database_order_offer_id_key UNIQUE (offer_id);


--
-- Name: hosting_database_order hosting_database_order_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_order
    ADD CONSTRAINT hosting_database_order_pkey PRIMARY KEY (id);


--
-- Name: hosting_database hosting_database_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_pkey PRIMARY KEY (id);


--
-- Name: hosting_database_plan hosting_database_plan_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_plan
    ADD CONSTRAINT hosting_database_plan_pkey PRIMARY KEY (id);


--
-- Name: hosting_database_pool hosting_database_pool_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_pool
    ADD CONSTRAINT hosting_database_pool_pkey PRIMARY KEY (cluster_id, pool_id);


--
-- Name: hosting_database_port hosting_database_port_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_port
    ADD CONSTRAINT hosting_database_port_pkey PRIMARY KEY (cluster_id, port);


--
-- Name: hosting_database_preview hosting_database_preview_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_preview
    ADD CONSTRAINT hosting_database_preview_pkey PRIMARY KEY (database_id, session_id, kind);


--
-- Name: hosting_enrollment hosting_enrollment_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_enrollment
    ADD CONSTRAINT hosting_enrollment_pkey PRIMARY KEY (id);


--
-- Name: hosting_enrollment hosting_enrollment_token_hash_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_enrollment
    ADD CONSTRAINT hosting_enrollment_token_hash_key UNIQUE (token_hash);


--
-- Name: hosting_external_state hosting_external_state_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_external_state
    ADD CONSTRAINT hosting_external_state_pkey PRIMARY KEY (cluster_id, uid);


--
-- Name: hosting_limit hosting_limit_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_limit
    ADD CONSTRAINT hosting_limit_pkey PRIMARY KEY (customer_id, scope);


--
-- Name: hosting_operation hosting_operation_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_operation
    ADD CONSTRAINT hosting_operation_pkey PRIMARY KEY (id);


--
-- Name: hosting_operation hosting_operation_subject_idempotency_key_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_operation
    ADD CONSTRAINT hosting_operation_subject_idempotency_key_key UNIQUE (subject, idempotency_key);


--
-- Name: hosting_project hosting_project_namespace_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_project
    ADD CONSTRAINT hosting_project_namespace_key UNIQUE (namespace);


--
-- Name: hosting_project hosting_project_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_project
    ADD CONSTRAINT hosting_project_pkey PRIMARY KEY (project_id);


--
-- Name: hosting_rate hosting_rate_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_rate
    ADD CONSTRAINT hosting_rate_pkey PRIMARY KEY (key_hash);


--
-- Name: hosting_reservation hosting_reservation_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_reservation
    ADD CONSTRAINT hosting_reservation_pkey PRIMARY KEY (operation_id);


--
-- Name: hosting_service_binding hosting_service_binding_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_service_binding
    ADD CONSTRAINT hosting_service_binding_pkey PRIMARY KEY (id);


--
-- Name: hosting_setup hosting_setup_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_setup
    ADD CONSTRAINT hosting_setup_pkey PRIMARY KEY (id);


--
-- Name: hosting_turbosmtp hosting_turbosmtp_credential_hash_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_turbosmtp
    ADD CONSTRAINT hosting_turbosmtp_credential_hash_key UNIQUE (credential_hash);


--
-- Name: hosting_turbosmtp hosting_turbosmtp_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_turbosmtp
    ADD CONSTRAINT hosting_turbosmtp_pkey PRIMARY KEY (customer_id);


--
-- Name: hosting_vercel hosting_vercel_configuration_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_vercel
    ADD CONSTRAINT hosting_vercel_configuration_id_key UNIQUE (configuration_id);


--
-- Name: hosting_vercel_flow hosting_vercel_flow_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_vercel_flow
    ADD CONSTRAINT hosting_vercel_flow_pkey PRIMARY KEY (state_hash);


--
-- Name: hosting_vercel hosting_vercel_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_vercel
    ADD CONSTRAINT hosting_vercel_pkey PRIMARY KEY (customer_id);


--
-- Name: hosting_vercel hosting_vercel_team_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_vercel
    ADD CONSTRAINT hosting_vercel_team_id_key UNIQUE (team_id);


--
-- Name: invitation invitation_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.invitation
    ADD CONSTRAINT invitation_pkey PRIMARY KEY (id);


--
-- Name: jwks jwks_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.jwks
    ADD CONSTRAINT jwks_pkey PRIMARY KEY (id);


--
-- Name: mail_api_key mail_api_key_customer_id_connection_id_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_api_key
    ADD CONSTRAINT mail_api_key_customer_id_connection_id_id_key UNIQUE (customer_id, connection_id, id);


--
-- Name: mail_api_key mail_api_key_key_hash_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_api_key
    ADD CONSTRAINT mail_api_key_key_hash_key UNIQUE (key_hash);


--
-- Name: mail_api_key mail_api_key_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_api_key
    ADD CONSTRAINT mail_api_key_pkey PRIMARY KEY (id);


--
-- Name: mail_batch mail_batch_customer_id_connection_id_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_batch
    ADD CONSTRAINT mail_batch_customer_id_connection_id_id_key UNIQUE (customer_id, connection_id, id);


--
-- Name: mail_batch_item mail_batch_item_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_batch_item
    ADD CONSTRAINT mail_batch_item_pkey PRIMARY KEY (batch_id, item_index);


--
-- Name: mail_batch mail_batch_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_batch
    ADD CONSTRAINT mail_batch_pkey PRIMARY KEY (id);


--
-- Name: mail_callback_inbox mail_callback_inbox_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_callback_inbox
    ADD CONSTRAINT mail_callback_inbox_pkey PRIMARY KEY (id);


--
-- Name: mail_callback_inbox mail_callback_inbox_source_id_dedupe_key_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_callback_inbox
    ADD CONSTRAINT mail_callback_inbox_source_id_dedupe_key_key UNIQUE (source_id, dedupe_key);


--
-- Name: mail_callback_source_connection mail_callback_source_connection_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_callback_source_connection
    ADD CONSTRAINT mail_callback_source_connection_pkey PRIMARY KEY (source_id, connection_id);


--
-- Name: mail_callback_source mail_callback_source_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_callback_source
    ADD CONSTRAINT mail_callback_source_pkey PRIMARY KEY (id);


--
-- Name: mail_callback_source mail_callback_source_secret_hash_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_callback_source
    ADD CONSTRAINT mail_callback_source_secret_hash_key UNIQUE (secret_hash);


--
-- Name: mail_connection mail_connection_customer_id_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_connection
    ADD CONSTRAINT mail_connection_customer_id_id_key UNIQUE (customer_id, id);


--
-- Name: mail_connection_domain mail_connection_domain_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_connection_domain
    ADD CONSTRAINT mail_connection_domain_pkey PRIMARY KEY (connection_id, domain_id);


--
-- Name: mail_connection mail_connection_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_connection
    ADD CONSTRAINT mail_connection_pkey PRIMARY KEY (id);


--
-- Name: mail_connection mail_connection_provider_account_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_connection
    ADD CONSTRAINT mail_connection_provider_account_id_key UNIQUE (provider_account_id);


--
-- Name: mail_connection_secret mail_connection_secret_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_connection_secret
    ADD CONSTRAINT mail_connection_secret_pkey PRIMARY KEY (connection_id, version);


--
-- Name: mail_connection_tracking_settings mail_connection_tracking_settings_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_connection_tracking_settings
    ADD CONSTRAINT mail_connection_tracking_settings_pkey PRIMARY KEY (connection_id);


--
-- Name: mail_event mail_event_connection_id_dedupe_key_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_event
    ADD CONSTRAINT mail_event_connection_id_dedupe_key_key UNIQUE (connection_id, dedupe_key);


--
-- Name: mail_event mail_event_customer_id_connection_id_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_event
    ADD CONSTRAINT mail_event_customer_id_connection_id_id_key UNIQUE (customer_id, connection_id, id);


--
-- Name: mail_event mail_event_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_event
    ADD CONSTRAINT mail_event_pkey PRIMARY KEY (id);


--
-- Name: mail_idempotency mail_idempotency_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_idempotency
    ADD CONSTRAINT mail_idempotency_pkey PRIMARY KEY (customer_id, connection_id, key);


--
-- Name: mail_import_map mail_import_map_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_import_map
    ADD CONSTRAINT mail_import_map_pkey PRIMARY KEY (source, kind, legacy_id);


--
-- Name: mail_job_lease mail_job_lease_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_job_lease
    ADD CONSTRAINT mail_job_lease_pkey PRIMARY KEY (name);


--
-- Name: mail_job_run mail_job_run_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_job_run
    ADD CONSTRAINT mail_job_run_pkey PRIMARY KEY (id);


--
-- Name: mail_message_content mail_message_content_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_message_content
    ADD CONSTRAINT mail_message_content_pkey PRIMARY KEY (message_id);


--
-- Name: mail_message mail_message_customer_id_connection_id_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_message
    ADD CONSTRAINT mail_message_customer_id_connection_id_id_key UNIQUE (customer_id, connection_id, id);


--
-- Name: mail_message mail_message_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_message
    ADD CONSTRAINT mail_message_pkey PRIMARY KEY (id);


--
-- Name: mail_message mail_message_provider_reference_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_message
    ADD CONSTRAINT mail_message_provider_reference_key UNIQUE (provider_reference);


--
-- Name: mail_provider_operation mail_provider_operation_label_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_provider_operation
    ADD CONSTRAINT mail_provider_operation_label_key UNIQUE (label);


--
-- Name: mail_provider_operation mail_provider_operation_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_provider_operation
    ADD CONSTRAINT mail_provider_operation_pkey PRIMARY KEY (id);


--
-- Name: mail_rate_window mail_rate_window_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_rate_window
    ADD CONSTRAINT mail_rate_window_pkey PRIMARY KEY (customer_id, kind, window_start);


--
-- Name: mail_recipient mail_recipient_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_recipient
    ADD CONSTRAINT mail_recipient_pkey PRIMARY KEY (message_id, email);


--
-- Name: mail_request_log mail_request_log_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_request_log
    ADD CONSTRAINT mail_request_log_pkey PRIMARY KEY (id);


--
-- Name: mail_sender_domain mail_sender_domain_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_sender_domain
    ADD CONSTRAINT mail_sender_domain_pkey PRIMARY KEY (id);


--
-- Name: mail_suppression mail_suppression_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_suppression
    ADD CONSTRAINT mail_suppression_pkey PRIMARY KEY (customer_id, email);


--
-- Name: mail_tenant_account mail_tenant_account_email_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tenant_account
    ADD CONSTRAINT mail_tenant_account_email_key UNIQUE (email);


--
-- Name: mail_tenant_account mail_tenant_account_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tenant_account
    ADD CONSTRAINT mail_tenant_account_pkey PRIMARY KEY (customer_id);


--
-- Name: mail_tenant_account mail_tenant_account_provider_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tenant_account
    ADD CONSTRAINT mail_tenant_account_provider_id_key UNIQUE (provider_id);


--
-- Name: mail_tracking_domain mail_tracking_domain_customer_id_domain_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tracking_domain
    ADD CONSTRAINT mail_tracking_domain_customer_id_domain_key UNIQUE (customer_id, domain);


--
-- Name: mail_tracking_domain mail_tracking_domain_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tracking_domain
    ADD CONSTRAINT mail_tracking_domain_pkey PRIMARY KEY (id);


--
-- Name: mail_tracking_operation mail_tracking_operation_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tracking_operation
    ADD CONSTRAINT mail_tracking_operation_pkey PRIMARY KEY (customer_id);


--
-- Name: mail_tracking_settings mail_tracking_settings_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tracking_settings
    ADD CONSTRAINT mail_tracking_settings_pkey PRIMARY KEY (customer_id);


--
-- Name: mail_usage_period mail_usage_period_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_usage_period
    ADD CONSTRAINT mail_usage_period_pkey PRIMARY KEY (customer_id, connection_id, period);


--
-- Name: mail_usage_reservation mail_usage_reservation_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_usage_reservation
    ADD CONSTRAINT mail_usage_reservation_pkey PRIMARY KEY (message_id);


--
-- Name: mail_webhook_attempt mail_webhook_attempt_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_webhook_attempt
    ADD CONSTRAINT mail_webhook_attempt_pkey PRIMARY KEY (id);


--
-- Name: mail_webhook mail_webhook_customer_id_connection_id_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_webhook
    ADD CONSTRAINT mail_webhook_customer_id_connection_id_id_key UNIQUE (customer_id, connection_id, id);


--
-- Name: mail_webhook_delivery mail_webhook_delivery_customer_id_connection_id_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_webhook_delivery
    ADD CONSTRAINT mail_webhook_delivery_customer_id_connection_id_id_key UNIQUE (customer_id, connection_id, id);


--
-- Name: mail_webhook_delivery mail_webhook_delivery_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_webhook_delivery
    ADD CONSTRAINT mail_webhook_delivery_pkey PRIMARY KEY (id);


--
-- Name: mail_webhook_delivery mail_webhook_delivery_webhook_id_event_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_webhook_delivery
    ADD CONSTRAINT mail_webhook_delivery_webhook_id_event_id_key UNIQUE (webhook_id, event_id);


--
-- Name: mail_webhook mail_webhook_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_webhook
    ADD CONSTRAINT mail_webhook_pkey PRIMARY KEY (id);


--
-- Name: managed_database_launch managed_database_launch_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.managed_database_launch
    ADD CONSTRAINT managed_database_launch_pkey PRIMARY KEY (token_hash);


--
-- Name: managed_database_session managed_database_session_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.managed_database_session
    ADD CONSTRAINT managed_database_session_id_key UNIQUE (id);


--
-- Name: managed_database_session managed_database_session_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.managed_database_session
    ADD CONSTRAINT managed_database_session_pkey PRIMARY KEY (token_hash);


--
-- Name: member member_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (id);


--
-- Name: oauthAccessToken oauthAccessToken_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_pkey" PRIMARY KEY (id);


--
-- Name: oauthAccessToken oauthAccessToken_token_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_token_key" UNIQUE (token);


--
-- Name: oauthClientAssertion oauthClientAssertion_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthClientAssertion"
    ADD CONSTRAINT "oauthClientAssertion_pkey" PRIMARY KEY (id);


--
-- Name: oauthClientResource oauthClientResource_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthClientResource"
    ADD CONSTRAINT "oauthClientResource_pkey" PRIMARY KEY (id);


--
-- Name: oauthClient oauthClient_clientId_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthClient"
    ADD CONSTRAINT "oauthClient_clientId_key" UNIQUE ("clientId");


--
-- Name: oauthClient oauthClient_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthClient"
    ADD CONSTRAINT "oauthClient_pkey" PRIMARY KEY (id);


--
-- Name: oauthConsent oauthConsent_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthConsent"
    ADD CONSTRAINT "oauthConsent_pkey" PRIMARY KEY (id);


--
-- Name: oauthRefreshToken oauthRefreshToken_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthRefreshToken"
    ADD CONSTRAINT "oauthRefreshToken_pkey" PRIMARY KEY (id);


--
-- Name: oauthRefreshToken oauthRefreshToken_token_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthRefreshToken"
    ADD CONSTRAINT "oauthRefreshToken_token_key" UNIQUE (token);


--
-- Name: oauthResource oauthResource_identifier_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthResource"
    ADD CONSTRAINT "oauthResource_identifier_key" UNIQUE (identifier);


--
-- Name: oauthResource oauthResource_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthResource"
    ADD CONSTRAINT "oauthResource_pkey" PRIMARY KEY (id);


--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);


--
-- Name: organization organization_slug_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.organization
    ADD CONSTRAINT organization_slug_key UNIQUE (slug);


--
-- Name: passkey passkey_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.passkey
    ADD CONSTRAINT passkey_pkey PRIMARY KEY (id);


--
-- Name: plan_offer plan_offer_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.plan_offer
    ADD CONSTRAINT plan_offer_pkey PRIMARY KEY (id);


--
-- Name: plan_offer plan_offer_token_hash_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.plan_offer
    ADD CONSTRAINT plan_offer_token_hash_key UNIQUE (token_hash);


--
-- Name: plan_template plan_template_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.plan_template
    ADD CONSTRAINT plan_template_pkey PRIMARY KEY (id);


--
-- Name: platform_mail_credential platform_mail_credential_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.platform_mail_credential
    ADD CONSTRAINT platform_mail_credential_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: project_grant project_grant_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.project_grant
    ADD CONSTRAINT project_grant_pkey PRIMARY KEY (id);


--
-- Name: project_grant project_grant_user_id_binding_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.project_grant
    ADD CONSTRAINT project_grant_user_id_binding_id_key UNIQUE (user_id, binding_id);


--
-- Name: rateLimit rateLimit_key_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."rateLimit"
    ADD CONSTRAINT "rateLimit_key_key" UNIQUE (key);


--
-- Name: rateLimit rateLimit_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."rateLimit"
    ADD CONSTRAINT "rateLimit_pkey" PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- Name: snowflake_state snowflake_state_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.snowflake_state
    ADD CONSTRAINT snowflake_state_pkey PRIMARY KEY (singleton);


--
-- Name: studio_tenant_preview studio_tenant_preview_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.studio_tenant_preview
    ADD CONSTRAINT studio_tenant_preview_pkey PRIMARY KEY (session_id);


--
-- Name: subscription_history subscription_history_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.subscription_history
    ADD CONSTRAINT subscription_history_pkey PRIMARY KEY (customer_id, revision);


--
-- Name: tenant_customer tenant_customer_organization_id_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.tenant_customer
    ADD CONSTRAINT tenant_customer_organization_id_key UNIQUE (organization_id);


--
-- Name: tenant_customer tenant_customer_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.tenant_customer
    ADD CONSTRAINT tenant_customer_pkey PRIMARY KEY (customer_id);


--
-- Name: tenant_storage tenant_storage_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.tenant_storage
    ADD CONSTRAINT tenant_storage_pkey PRIMARY KEY (id);


--
-- Name: tenant_storage tenant_storage_store_id_prefix_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.tenant_storage
    ADD CONSTRAINT tenant_storage_store_id_prefix_key UNIQUE (store_id, prefix);


--
-- Name: tenant_subscription tenant_subscription_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.tenant_subscription
    ADD CONSTRAINT tenant_subscription_pkey PRIMARY KEY (customer_id);


--
-- Name: twoFactor twoFactor_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."twoFactor"
    ADD CONSTRAINT "twoFactor_pkey" PRIMARY KEY (id);


--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: access_event access_event_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.access_event
    ADD CONSTRAINT access_event_pkey PRIMARY KEY (id);


--
-- Name: api_key api_key_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.api_key
    ADD CONSTRAINT api_key_pkey PRIMARY KEY (id);


--
-- Name: api_key api_key_token_hash_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.api_key
    ADD CONSTRAINT api_key_token_hash_key UNIQUE (token_hash);


--
-- Name: budget_reservation budget_reservation_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.budget_reservation
    ADD CONSTRAINT budget_reservation_pkey PRIMARY KEY (reference_id);


--
-- Name: cluster_reservation cluster_reservation_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.cluster_reservation
    ADD CONSTRAINT cluster_reservation_pkey PRIMARY KEY (customer_id);


--
-- Name: configuration_operation configuration_operation_customer_id_revision_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.configuration_operation
    ADD CONSTRAINT configuration_operation_customer_id_revision_key UNIQUE (customer_id, revision);


--
-- Name: configuration_operation configuration_operation_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.configuration_operation
    ADD CONSTRAINT configuration_operation_pkey PRIMARY KEY (id);


--
-- Name: configuration configuration_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.configuration
    ADD CONSTRAINT configuration_pkey PRIMARY KEY (customer_id);


--
-- Name: domain domain_customer_id_id_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.domain
    ADD CONSTRAINT domain_customer_id_id_key UNIQUE (customer_id, id);


--
-- Name: domain domain_name_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.domain
    ADD CONSTRAINT domain_name_key UNIQUE (name);


--
-- Name: domain domain_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.domain
    ADD CONSTRAINT domain_pkey PRIMARY KEY (id);


--
-- Name: domain domain_sender_domain_id_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.domain
    ADD CONSTRAINT domain_sender_domain_id_key UNIQUE (sender_domain_id);


--
-- Name: identity identity_customer_id_id_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.identity
    ADD CONSTRAINT identity_customer_id_id_key UNIQUE (customer_id, id);


--
-- Name: identity identity_customer_id_subject_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.identity
    ADD CONSTRAINT identity_customer_id_subject_key UNIQUE (customer_id, subject);


--
-- Name: identity identity_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.identity
    ADD CONSTRAINT identity_pkey PRIMARY KEY (id);


--
-- Name: instance instance_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.instance
    ADD CONSTRAINT instance_pkey PRIMARY KEY (customer_id);


--
-- Name: mailbox mailbox_customer_id_id_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.mailbox
    ADD CONSTRAINT mailbox_customer_id_id_key UNIQUE (customer_id, id);


--
-- Name: mailbox mailbox_domain_id_local_part_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.mailbox
    ADD CONSTRAINT mailbox_domain_id_local_part_key UNIQUE (domain_id, local_part);


--
-- Name: mailbox_grant mailbox_grant_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.mailbox_grant
    ADD CONSTRAINT mailbox_grant_pkey PRIMARY KEY (mailbox_id, subject);


--
-- Name: mailbox mailbox_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.mailbox
    ADD CONSTRAINT mailbox_pkey PRIMARY KEY (id);


--
-- Name: month_usage month_usage_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.month_usage
    ADD CONSTRAINT month_usage_pkey PRIMARY KEY (customer_id, period_start);


--
-- Name: operation operation_customer_id_revision_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.operation
    ADD CONSTRAINT operation_customer_id_revision_key UNIQUE (customer_id, revision);


--
-- Name: operation operation_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.operation
    ADD CONSTRAINT operation_pkey PRIMARY KEY (id);


--
-- Name: send_job send_job_customer_id_source_id_idempotency_key_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.send_job
    ADD CONSTRAINT send_job_customer_id_source_id_idempotency_key_key UNIQUE (customer_id, source_id, idempotency_key);


--
-- Name: send_job send_job_payload_ref_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.send_job
    ADD CONSTRAINT send_job_payload_ref_key UNIQUE (payload_ref);


--
-- Name: send_job send_job_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.send_job
    ADD CONSTRAINT send_job_pkey PRIMARY KEY (id);


--
-- Name: send_transport send_transport_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.send_transport
    ADD CONSTRAINT send_transport_pkey PRIMARY KEY (customer_id);


--
-- Name: service service_instance_key_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.service
    ADD CONSTRAINT service_instance_key_key UNIQUE (instance_key);


--
-- Name: service service_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.service
    ADD CONSTRAINT service_pkey PRIMARY KEY (customer_id);


--
-- Name: webmail_launch webmail_launch_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_launch
    ADD CONSTRAINT webmail_launch_pkey PRIMARY KEY (token_hash);


--
-- Name: webmail_session webmail_session_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_session
    ADD CONSTRAINT webmail_session_pkey PRIMARY KEY (id);


--
-- Name: webmail_session webmail_session_token_hash_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_session
    ADD CONSTRAINT webmail_session_token_hash_key UNIQUE (token_hash);


--
-- Name: webmail_write webmail_write_mailbox_id_subject_request_id_key; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_write
    ADD CONSTRAINT webmail_write_mailbox_id_subject_request_id_key UNIQUE (mailbox_id, subject, request_id);


--
-- Name: webmail_write webmail_write_pkey; Type: CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_write
    ADD CONSTRAINT webmail_write_pkey PRIMARY KEY (id);


--
-- Name: audit_events_actor_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX audit_events_actor_idx ON webdock_admin.audit_events USING btree (actor_id);


--
-- Name: audit_events_created_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX audit_events_created_at_idx ON webdock_admin.audit_events USING btree (created_at);


--
-- Name: audit_events_target_i_d_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX audit_events_target_i_d_idx ON webdock_admin.audit_events USING btree (target_i_d);


--
-- Name: audit_events_updated_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX audit_events_updated_at_idx ON webdock_admin.audit_events USING btree (updated_at);


--
-- Name: cms_instances_created_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX cms_instances_created_at_idx ON webdock_admin.cms_instances USING btree (created_at);


--
-- Name: cms_instances_project_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE UNIQUE INDEX cms_instances_project_idx ON webdock_admin.cms_instances USING btree (project_id);


--
-- Name: cms_instances_provider_project_i_d_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE UNIQUE INDEX cms_instances_provider_project_i_d_idx ON webdock_admin.cms_instances USING btree (provider_project_i_d);


--
-- Name: cms_instances_schema_name_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE UNIQUE INDEX cms_instances_schema_name_idx ON webdock_admin.cms_instances USING btree (schema_name);


--
-- Name: cms_instances_updated_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX cms_instances_updated_at_idx ON webdock_admin.cms_instances USING btree (updated_at);


--
-- Name: customers_created_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX customers_created_at_idx ON webdock_admin.customers USING btree (created_at);


--
-- Name: customers_updated_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX customers_updated_at_idx ON webdock_admin.customers USING btree (updated_at);


--
-- Name: payload_kv_key_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE UNIQUE INDEX payload_kv_key_idx ON webdock_admin.payload_kv USING btree (key);


--
-- Name: payload_locked_documents_created_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_locked_documents_created_at_idx ON webdock_admin.payload_locked_documents USING btree (created_at);


--
-- Name: payload_locked_documents_global_slug_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_locked_documents_global_slug_idx ON webdock_admin.payload_locked_documents USING btree (global_slug);


--
-- Name: payload_locked_documents_rels_audit_events_id_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_locked_documents_rels_audit_events_id_idx ON webdock_admin.payload_locked_documents_rels USING btree (audit_events_id);


--
-- Name: payload_locked_documents_rels_cms_instances_id_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_locked_documents_rels_cms_instances_id_idx ON webdock_admin.payload_locked_documents_rels USING btree (cms_instances_id);


--
-- Name: payload_locked_documents_rels_customers_id_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_locked_documents_rels_customers_id_idx ON webdock_admin.payload_locked_documents_rels USING btree (customers_id);


--
-- Name: payload_locked_documents_rels_order_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_locked_documents_rels_order_idx ON webdock_admin.payload_locked_documents_rels USING btree ("order");


--
-- Name: payload_locked_documents_rels_parent_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_locked_documents_rels_parent_idx ON webdock_admin.payload_locked_documents_rels USING btree (parent_id);


--
-- Name: payload_locked_documents_rels_path_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_locked_documents_rels_path_idx ON webdock_admin.payload_locked_documents_rels USING btree (path);


--
-- Name: payload_locked_documents_rels_projects_id_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_locked_documents_rels_projects_id_idx ON webdock_admin.payload_locked_documents_rels USING btree (projects_id);


--
-- Name: payload_locked_documents_rels_users_id_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_locked_documents_rels_users_id_idx ON webdock_admin.payload_locked_documents_rels USING btree (users_id);


--
-- Name: payload_locked_documents_updated_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_locked_documents_updated_at_idx ON webdock_admin.payload_locked_documents USING btree (updated_at);


--
-- Name: payload_migrations_created_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_migrations_created_at_idx ON webdock_admin.payload_migrations USING btree (created_at);


--
-- Name: payload_migrations_updated_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_migrations_updated_at_idx ON webdock_admin.payload_migrations USING btree (updated_at);


--
-- Name: payload_preferences_created_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_preferences_created_at_idx ON webdock_admin.payload_preferences USING btree (created_at);


--
-- Name: payload_preferences_key_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_preferences_key_idx ON webdock_admin.payload_preferences USING btree (key);


--
-- Name: payload_preferences_rels_order_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_preferences_rels_order_idx ON webdock_admin.payload_preferences_rels USING btree ("order");


--
-- Name: payload_preferences_rels_parent_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_preferences_rels_parent_idx ON webdock_admin.payload_preferences_rels USING btree (parent_id);


--
-- Name: payload_preferences_rels_path_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_preferences_rels_path_idx ON webdock_admin.payload_preferences_rels USING btree (path);


--
-- Name: payload_preferences_rels_users_id_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_preferences_rels_users_id_idx ON webdock_admin.payload_preferences_rels USING btree (users_id);


--
-- Name: payload_preferences_updated_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX payload_preferences_updated_at_idx ON webdock_admin.payload_preferences USING btree (updated_at);


--
-- Name: projects_created_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX projects_created_at_idx ON webdock_admin.projects USING btree (created_at);


--
-- Name: projects_customer_identity; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE UNIQUE INDEX projects_customer_identity ON webdock_admin.projects USING btree (id, customer_id);


--
-- Name: projects_customer_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX projects_customer_idx ON webdock_admin.projects USING btree (customer_id);


--
-- Name: projects_updated_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX projects_updated_at_idx ON webdock_admin.projects USING btree (updated_at);


--
-- Name: users_auth_subject_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE UNIQUE INDEX users_auth_subject_idx ON webdock_admin.users USING btree (auth_subject);


--
-- Name: users_created_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX users_created_at_idx ON webdock_admin.users USING btree (created_at);


--
-- Name: users_email_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE UNIQUE INDEX users_email_idx ON webdock_admin.users USING btree (email);


--
-- Name: users_sessions_order_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX users_sessions_order_idx ON webdock_admin.users_sessions USING btree (_order);


--
-- Name: users_sessions_parent_id_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX users_sessions_parent_id_idx ON webdock_admin.users_sessions USING btree (_parent_id);


--
-- Name: users_updated_at_idx; Type: INDEX; Schema: webdock_admin; Owner: -
--

CREATE INDEX users_updated_at_idx ON webdock_admin.users USING btree (updated_at);


--
-- Name: account_userId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "account_userId_idx" ON webdock_auth.account USING btree ("userId");


--
-- Name: database_launch_expiry; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX database_launch_expiry ON webdock_auth.database_launch USING btree (expires_at);


--
-- Name: database_session_expiry; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX database_session_expiry ON webdock_auth.database_session USING btree (expires_at);


--
-- Name: git_build_actions_run; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX git_build_actions_run ON webdock_auth.git_build USING btree (source_id, ((actions_provenance ->> 'runID'::text)), ((actions_provenance ->> 'runAttempt'::text))) WHERE (actions_provenance IS NOT NULL);


--
-- Name: git_build_queue; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX git_build_queue ON webdock_auth.git_build USING btree (status, created_at);


--
-- Name: git_release_source_publication; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX git_release_source_publication ON webdock_auth.git_release USING btree (source_id) WHERE (status = ANY (ARRAY['deploying'::text, 'needs-reconciliation'::text]));


--
-- Name: git_source_project_target_key; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX git_source_project_target_key ON webdock_auth.git_source USING btree (project_id, target_id);


--
-- Name: hosting_app_name; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX hosting_app_name ON webdock_auth.hosting_app USING btree (project_id, name) WHERE (status <> 'deleted'::text);


--
-- Name: hosting_app_project_identity; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX hosting_app_project_identity ON webdock_auth.hosting_app USING btree (id, project_id);


--
-- Name: hosting_binding_variable; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX hosting_binding_variable ON webdock_auth.hosting_service_binding USING btree (app_id, variable) WHERE (state <> 'disconnected'::text);


--
-- Name: hosting_database_backend_members; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX hosting_database_backend_members ON webdock_auth.hosting_database USING btree (backend_id, state);


--
-- Name: hosting_database_customer; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX hosting_database_customer ON webdock_auth.hosting_database USING btree (customer_id, project_id);


--
-- Name: hosting_database_direct_port_active; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX hosting_database_direct_port_active ON webdock_auth.hosting_database_backend USING btree (cluster_id, direct_port) WHERE (state <> 'purged'::text);


--
-- Name: hosting_database_pending_migration; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX hosting_database_pending_migration ON webdock_auth.hosting_database_migration USING btree (database_id) WHERE (state = ANY (ARRAY['preparing'::text, 'copying'::text, 'needs-reconciliation'::text]));


--
-- Name: hosting_database_pooled_port_active; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX hosting_database_pooled_port_active ON webdock_auth.hosting_database_backend USING btree (cluster_id, pooled_port) WHERE (state <> 'purged'::text);


--
-- Name: hosting_project_customer_key; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX hosting_project_customer_key ON webdock_auth.hosting_project USING btree (project_id, customer_id);


--
-- Name: hosting_queue; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX hosting_queue ON webdock_auth.hosting_operation USING btree (cluster_id, status, created_at);


--
-- Name: hosting_setup_due; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX hosting_setup_due ON webdock_auth.hosting_setup USING btree (next_attempt_at) WHERE (state = 'running'::text);


--
-- Name: invitation_email_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX invitation_email_idx ON webdock_auth.invitation USING btree (email);


--
-- Name: invitation_organizationId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "invitation_organizationId_idx" ON webdock_auth.invitation USING btree ("organizationId");


--
-- Name: mail_batch_item_message; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_batch_item_message ON webdock_auth.mail_batch_item USING btree (message_id);


--
-- Name: mail_callback_due; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_callback_due ON webdock_auth.mail_callback_inbox USING btree (created_at, id) WHERE (status = ANY (ARRAY['pending'::text, 'quarantined'::text]));


--
-- Name: mail_callback_processed; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_callback_processed ON webdock_auth.mail_callback_inbox USING btree (processed_at, id) WHERE (status = 'processed'::text);


--
-- Name: mail_connection_active_secret; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX mail_connection_active_secret ON webdock_auth.mail_connection_secret USING btree (connection_id) WHERE active;


--
-- Name: mail_connection_active_source; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX mail_connection_active_source ON webdock_auth.mail_connection USING btree (customer_id, kind) WHERE (deleted_at IS NULL);


--
-- Name: mail_content_retention; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_content_retention ON webdock_auth.mail_message_content USING btree (expires_at, message_id) WHERE (expires_at IS NOT NULL);


--
-- Name: mail_delivery_event; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_delivery_event ON webdock_auth.mail_webhook_delivery USING btree (event_id);


--
-- Name: mail_delivery_retention; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_delivery_retention ON webdock_auth.mail_webhook_delivery USING btree (finished_at, id) WHERE (status = ANY (ARRAY['succeeded'::text, 'failed'::text, 'canceled'::text]));


--
-- Name: mail_event_message; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_event_message ON webdock_auth.mail_event USING btree (message_id) WHERE (message_id IS NOT NULL);


--
-- Name: mail_event_resource; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_event_resource ON webdock_auth.mail_event USING btree (customer_id, connection_id, resource_id, occurred_at, id);


--
-- Name: mail_event_retention; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_event_retention ON webdock_auth.mail_event USING btree (created_at, id);


--
-- Name: mail_idempotency_batch; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_idempotency_batch ON webdock_auth.mail_idempotency USING btree (batch_id) WHERE (batch_id IS NOT NULL);


--
-- Name: mail_idempotency_message; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_idempotency_message ON webdock_auth.mail_idempotency USING btree (message_id) WHERE (message_id IS NOT NULL);


--
-- Name: mail_idempotency_retention; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_idempotency_retention ON webdock_auth.mail_idempotency USING btree (expires_at) WHERE (status = 'completed'::text);


--
-- Name: mail_message_due; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_message_due ON webdock_auth.mail_message USING btree (scheduled_at, id) WHERE (dispatch_status = 'scheduled'::text);


--
-- Name: mail_message_list; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_message_list ON webdock_auth.mail_message USING btree (customer_id, connection_id, created_at DESC, id DESC);


--
-- Name: mail_message_provider_mid_unique; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX mail_message_provider_mid_unique ON webdock_auth.mail_message USING btree (connection_id, provider_mid) WHERE (provider_mid IS NOT NULL);


--
-- Name: mail_message_retention; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_message_retention ON webdock_auth.mail_message USING btree (terminal_at, id) WHERE (terminal_at IS NOT NULL);


--
-- Name: mail_request_log_list; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_request_log_list ON webdock_auth.mail_request_log USING btree (customer_id, connection_id, created_at DESC, id DESC);


--
-- Name: mail_request_log_retention; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_request_log_retention ON webdock_auth.mail_request_log USING btree (created_at, id);


--
-- Name: mail_sender_domain_customer_id; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX mail_sender_domain_customer_id ON webdock_auth.mail_sender_domain USING btree (customer_id, id);


--
-- Name: mail_sender_domain_live_claim; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX mail_sender_domain_live_claim ON webdock_auth.mail_sender_domain USING btree (customer_id, domain) WHERE (deleted_at IS NULL);


--
-- Name: mail_sender_domain_tenant_id; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX mail_sender_domain_tenant_id ON webdock_auth.mail_sender_domain USING btree (customer_id, id);


--
-- Name: mail_tracking_provider_legacy; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX mail_tracking_provider_legacy ON webdock_auth.mail_tracking_domain USING btree (customer_id, provider_id) WHERE (connection_id IS NULL);


--
-- Name: mail_tracking_provider_per_connection; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX mail_tracking_provider_per_connection ON webdock_auth.mail_tracking_domain USING btree (connection_id, provider_id) WHERE (connection_id IS NOT NULL);


--
-- Name: mail_verified_domain; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX mail_verified_domain ON webdock_auth.mail_sender_domain USING btree (domain) WHERE ((status = 'ownership_verified'::text) AND (deleted_at IS NULL));


--
-- Name: mail_webhook_attempt_delivery; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_webhook_attempt_delivery ON webdock_auth.mail_webhook_attempt USING btree (delivery_id, created_at, id);


--
-- Name: mail_webhook_due; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX mail_webhook_due ON webdock_auth.mail_webhook_delivery USING btree (next_at, id) WHERE (status = ANY (ARRAY['pending'::text, 'delivering'::text]));


--
-- Name: managed_database_launch_expiry; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX managed_database_launch_expiry ON webdock_auth.managed_database_launch USING btree (expires_at);


--
-- Name: managed_database_session_expiry; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX managed_database_session_expiry ON webdock_auth.managed_database_session USING btree (expires_at);


--
-- Name: member_organizationId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "member_organizationId_idx" ON webdock_auth.member USING btree ("organizationId");


--
-- Name: member_userId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "member_userId_idx" ON webdock_auth.member USING btree ("userId");


--
-- Name: oauthAccessToken_authorizationCodeId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthAccessToken_authorizationCodeId_idx" ON webdock_auth."oauthAccessToken" USING btree ("authorizationCodeId");


--
-- Name: oauthAccessToken_clientId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthAccessToken_clientId_idx" ON webdock_auth."oauthAccessToken" USING btree ("clientId");


--
-- Name: oauthAccessToken_refreshId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthAccessToken_refreshId_idx" ON webdock_auth."oauthAccessToken" USING btree ("refreshId");


--
-- Name: oauthAccessToken_sessionId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthAccessToken_sessionId_idx" ON webdock_auth."oauthAccessToken" USING btree ("sessionId");


--
-- Name: oauthAccessToken_userId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthAccessToken_userId_idx" ON webdock_auth."oauthAccessToken" USING btree ("userId");


--
-- Name: oauthClientResource_clientId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthClientResource_clientId_idx" ON webdock_auth."oauthClientResource" USING btree ("clientId");


--
-- Name: oauthClientResource_clientId_resourceId_uidx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE UNIQUE INDEX "oauthClientResource_clientId_resourceId_uidx" ON webdock_auth."oauthClientResource" USING btree ("clientId", "resourceId");


--
-- Name: oauthClientResource_resourceId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthClientResource_resourceId_idx" ON webdock_auth."oauthClientResource" USING btree ("resourceId");


--
-- Name: oauthClient_userId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthClient_userId_idx" ON webdock_auth."oauthClient" USING btree ("userId");


--
-- Name: oauthConsent_clientId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthConsent_clientId_idx" ON webdock_auth."oauthConsent" USING btree ("clientId");


--
-- Name: oauthConsent_userId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthConsent_userId_idx" ON webdock_auth."oauthConsent" USING btree ("userId");


--
-- Name: oauthRefreshToken_authorizationCodeId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthRefreshToken_authorizationCodeId_idx" ON webdock_auth."oauthRefreshToken" USING btree ("authorizationCodeId");


--
-- Name: oauthRefreshToken_clientId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthRefreshToken_clientId_idx" ON webdock_auth."oauthRefreshToken" USING btree ("clientId");


--
-- Name: oauthRefreshToken_sessionId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthRefreshToken_sessionId_idx" ON webdock_auth."oauthRefreshToken" USING btree ("sessionId");


--
-- Name: oauthRefreshToken_userId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "oauthRefreshToken_userId_idx" ON webdock_auth."oauthRefreshToken" USING btree ("userId");


--
-- Name: passkey_credentialID_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "passkey_credentialID_idx" ON webdock_auth.passkey USING btree ("credentialID");


--
-- Name: passkey_userId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "passkey_userId_idx" ON webdock_auth.passkey USING btree ("userId");


--
-- Name: plan_offer_customer; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX plan_offer_customer ON webdock_auth.plan_offer USING btree (customer_id, created_at DESC);


--
-- Name: session_userId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "session_userId_idx" ON webdock_auth.session USING btree ("userId");


--
-- Name: tenant_storage_customer; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX tenant_storage_customer ON webdock_auth.tenant_storage USING btree (customer_id);


--
-- Name: twoFactor_secret_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "twoFactor_secret_idx" ON webdock_auth."twoFactor" USING btree (secret);


--
-- Name: twoFactor_userId_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX "twoFactor_userId_idx" ON webdock_auth."twoFactor" USING btree ("userId");


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: webdock_auth; Owner: -
--

CREATE INDEX verification_identifier_idx ON webdock_auth.verification USING btree (identifier);


--
-- Name: mail_budget_customer; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE INDEX mail_budget_customer ON webdock_mail.budget_reservation USING btree (customer_id, period_start);


--
-- Name: mail_configuration_running; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE UNIQUE INDEX mail_configuration_running ON webdock_mail.configuration_operation USING btree (customer_id) WHERE (state = 'running'::text);


--
-- Name: mail_domain_provider; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE UNIQUE INDEX mail_domain_provider ON webdock_mail.domain USING btree (customer_id, provider_id) WHERE (provider_id IS NOT NULL);


--
-- Name: mail_identity_provider; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE UNIQUE INDEX mail_identity_provider ON webdock_mail.identity USING btree (customer_id, provider_id) WHERE (provider_id IS NOT NULL);


--
-- Name: mail_mailbox_provider; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE UNIQUE INDEX mail_mailbox_provider ON webdock_mail.mailbox USING btree (customer_id, provider_id) WHERE (provider_id IS NOT NULL);


--
-- Name: mail_operation_due; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE INDEX mail_operation_due ON webdock_mail.operation USING btree (created_at) WHERE (state = 'pending'::text);


--
-- Name: mail_operation_running; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE UNIQUE INDEX mail_operation_running ON webdock_mail.operation USING btree (customer_id) WHERE (state = 'running'::text);


--
-- Name: native_mail_key_customer; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE INDEX native_mail_key_customer ON webdock_mail.api_key USING btree (customer_id);


--
-- Name: send_job_cleanup; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE INDEX send_job_cleanup ON webdock_mail.send_job USING btree (finished_at) WHERE ((state = ANY (ARRAY['accepted'::text, 'rejected'::text, 'cancelled'::text])) AND (payload_deleted_at IS NULL) AND ((payload_format = 'request'::text) OR (state <> 'accepted'::text) OR (filing_state = 'complete'::text)));


--
-- Name: send_job_due; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE INDEX send_job_due ON webdock_mail.send_job USING btree (not_before, id) WHERE (state = 'queued'::text);


--
-- Name: send_job_expiry; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE INDEX send_job_expiry ON webdock_mail.send_job USING btree (lease_until) WHERE (state = ANY (ARRAY['leased'::text, 'handoff'::text]));


--
-- Name: send_job_staging_expiry; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE INDEX send_job_staging_expiry ON webdock_mail.send_job USING btree (lease_until) WHERE (state = 'staging'::text);


--
-- Name: webmail_launch_expiry; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE INDEX webmail_launch_expiry ON webdock_mail.webmail_launch USING btree (expires_at);


--
-- Name: webmail_session_expiry; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE INDEX webmail_session_expiry ON webdock_mail.webmail_session USING btree (expires_at);


--
-- Name: webmail_single_submission; Type: INDEX; Schema: webdock_mail; Owner: -
--

CREATE UNIQUE INDEX webmail_single_submission ON webdock_mail.webmail_write USING btree (mailbox_id, resource_id) WHERE ((action = 'submit'::text) AND (state <> 'rejected'::text));


--
-- Name: customers webdock_customer_tenant; Type: TRIGGER; Schema: webdock_admin; Owner: -
--

CREATE TRIGGER webdock_customer_tenant AFTER INSERT OR UPDATE OF name ON webdock_admin.customers FOR EACH ROW EXECUTE FUNCTION webdock_auth.sync_customer_tenant();


--
-- Name: hosting_database_offer database_offer_immutable; Type: TRIGGER; Schema: webdock_auth; Owner: -
--

CREATE TRIGGER database_offer_immutable BEFORE UPDATE ON webdock_auth.hosting_database_offer FOR EACH ROW EXECUTE FUNCTION webdock_auth.database_immutable_terms();


--
-- Name: hosting_database_order database_order_immutable; Type: TRIGGER; Schema: webdock_auth; Owner: -
--

CREATE TRIGGER database_order_immutable BEFORE UPDATE ON webdock_auth.hosting_database_order FOR EACH ROW EXECUTE FUNCTION webdock_auth.database_immutable_terms();


--
-- Name: hosting_database_plan database_plan_immutable; Type: TRIGGER; Schema: webdock_auth; Owner: -
--

CREATE TRIGGER database_plan_immutable BEFORE UPDATE ON webdock_auth.hosting_database_plan FOR EACH ROW EXECUTE FUNCTION webdock_auth.database_immutable_terms();


--
-- Name: member webdock_customer_owner_member; Type: TRIGGER; Schema: webdock_auth; Owner: -
--

CREATE TRIGGER webdock_customer_owner_member BEFORE DELETE OR UPDATE ON webdock_auth.member FOR EACH ROW EXECUTE FUNCTION webdock_auth.guard_customer_owner();


--
-- Name: user webdock_customer_owner_user; Type: TRIGGER; Schema: webdock_auth; Owner: -
--

CREATE TRIGGER webdock_customer_owner_user BEFORE DELETE OR UPDATE ON webdock_auth."user" FOR EACH ROW EXECUTE FUNCTION webdock_auth.guard_customer_owner();


--
-- Name: mailbox_grant mail_member_detached_after; Type: TRIGGER; Schema: webdock_mail; Owner: -
--

CREATE TRIGGER mail_member_detached_after AFTER UPDATE OF member_id ON webdock_mail.mailbox_grant FOR EACH ROW WHEN (((old.member_id IS NOT NULL) AND (new.member_id IS NULL))) EXECUTE FUNCTION webdock_mail.revoke_detached_member();


--
-- Name: mailbox_grant mail_member_detached_before; Type: TRIGGER; Schema: webdock_mail; Owner: -
--

CREATE TRIGGER mail_member_detached_before BEFORE UPDATE OF member_id ON webdock_mail.mailbox_grant FOR EACH ROW WHEN (((old.member_id IS NOT NULL) AND (new.member_id IS NULL))) EXECUTE FUNCTION webdock_mail.revoke_detached_member();


--
-- Name: audit_events audit_events_actor_id_users_id_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.audit_events
    ADD CONSTRAINT audit_events_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES webdock_admin.users(id) ON DELETE SET NULL;


--
-- Name: cms_instances cms_instances_project_id_projects_id_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.cms_instances
    ADD CONSTRAINT cms_instances_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES webdock_admin.projects(id) ON DELETE SET NULL;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_audit_events_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_audit_events_fk FOREIGN KEY (audit_events_id) REFERENCES webdock_admin.audit_events(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_cms_instances_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_cms_instances_fk FOREIGN KEY (cms_instances_id) REFERENCES webdock_admin.cms_instances(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_customers_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_customers_fk FOREIGN KEY (customers_id) REFERENCES webdock_admin.customers(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_parent_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES webdock_admin.payload_locked_documents(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_projects_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_projects_fk FOREIGN KEY (projects_id) REFERENCES webdock_admin.projects(id) ON DELETE CASCADE;


--
-- Name: payload_locked_documents_rels payload_locked_documents_rels_users_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_users_fk FOREIGN KEY (users_id) REFERENCES webdock_admin.users(id) ON DELETE CASCADE;


--
-- Name: payload_preferences_rels payload_preferences_rels_parent_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES webdock_admin.payload_preferences(id) ON DELETE CASCADE;


--
-- Name: payload_preferences_rels payload_preferences_rels_users_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.payload_preferences_rels
    ADD CONSTRAINT payload_preferences_rels_users_fk FOREIGN KEY (users_id) REFERENCES webdock_admin.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.projects
    ADD CONSTRAINT projects_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id) ON DELETE SET NULL;


--
-- Name: users_sessions users_sessions_parent_id_fk; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.users_sessions
    ADD CONSTRAINT users_sessions_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES webdock_admin.users(id) ON DELETE CASCADE;


--
-- Name: vercel_project_link vercel_project_link_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_admin; Owner: -
--

ALTER TABLE ONLY webdock_admin.vercel_project_link
    ADD CONSTRAINT vercel_project_link_project_id_fkey FOREIGN KEY (project_id) REFERENCES webdock_admin.projects(id) ON DELETE CASCADE;


--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES webdock_auth."user"(id) ON DELETE CASCADE;


--
-- Name: app_binding app_binding_client_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.app_binding
    ADD CONSTRAINT app_binding_client_id_fkey FOREIGN KEY (client_id) REFERENCES webdock_auth."oauthClient"("clientId");


--
-- Name: app_binding app_binding_organization_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.app_binding
    ADD CONSTRAINT app_binding_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES webdock_auth.organization(id);


--
-- Name: database_audit database_audit_binding_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_audit
    ADD CONSTRAINT database_audit_binding_id_fkey FOREIGN KEY (binding_id) REFERENCES webdock_auth.database_binding(id);


--
-- Name: database_binding database_binding_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_binding
    ADD CONSTRAINT database_binding_project_id_fkey FOREIGN KEY (project_id) REFERENCES webdock_admin.projects(id);


--
-- Name: database_grant database_grant_binding_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_grant
    ADD CONSTRAINT database_grant_binding_id_fkey FOREIGN KEY (binding_id) REFERENCES webdock_auth.database_binding(id);


--
-- Name: database_grant database_grant_subject_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_grant
    ADD CONSTRAINT database_grant_subject_fkey FOREIGN KEY (subject) REFERENCES webdock_auth."user"(id);


--
-- Name: database_launch database_launch_grant_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_launch
    ADD CONSTRAINT database_launch_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES webdock_auth.database_grant(id);


--
-- Name: database_launch database_launch_session_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_launch
    ADD CONSTRAINT database_launch_session_id_fkey FOREIGN KEY (session_id) REFERENCES webdock_auth.session(id) ON DELETE CASCADE;


--
-- Name: database_runtime_owner database_runtime_owner_binding_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_runtime_owner
    ADD CONSTRAINT database_runtime_owner_binding_id_fkey FOREIGN KEY (binding_id) REFERENCES webdock_auth.database_binding(id);


--
-- Name: database_runtime_owner database_runtime_owner_subject_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_runtime_owner
    ADD CONSTRAINT database_runtime_owner_subject_fkey FOREIGN KEY (subject) REFERENCES webdock_auth."user"(id);


--
-- Name: database_session database_session_grant_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_session
    ADD CONSTRAINT database_session_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES webdock_auth.database_grant(id);


--
-- Name: database_session database_session_session_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.database_session
    ADD CONSTRAINT database_session_session_id_fkey FOREIGN KEY (session_id) REFERENCES webdock_auth.session(id) ON DELETE CASCADE;


--
-- Name: git_artifact git_artifact_build_id_customer_id_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_artifact
    ADD CONSTRAINT git_artifact_build_id_customer_id_project_id_fkey FOREIGN KEY (build_id, customer_id, project_id) REFERENCES webdock_auth.git_build(id, customer_id, project_id);


--
-- Name: git_build git_build_source_id_customer_id_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_build
    ADD CONSTRAINT git_build_source_id_customer_id_project_id_fkey FOREIGN KEY (source_id, customer_id, project_id) REFERENCES webdock_auth.git_source(id, customer_id, project_id);


--
-- Name: git_build git_build_worker_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_build
    ADD CONSTRAINT git_build_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES webdock_auth.git_worker(id);


--
-- Name: git_check_outbox git_check_outbox_build_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_check_outbox
    ADD CONSTRAINT git_check_outbox_build_id_fkey FOREIGN KEY (build_id) REFERENCES webdock_auth.git_build(id);


--
-- Name: git_connection git_connection_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_connection
    ADD CONSTRAINT git_connection_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id);


--
-- Name: git_flow git_flow_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_flow
    ADD CONSTRAINT git_flow_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id);


--
-- Name: git_release git_release_artifact_id_customer_id_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_release
    ADD CONSTRAINT git_release_artifact_id_customer_id_project_id_fkey FOREIGN KEY (artifact_id, customer_id, project_id) REFERENCES webdock_auth.git_artifact(id, customer_id, project_id);


--
-- Name: git_release git_release_source_owner_fk; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_release
    ADD CONSTRAINT git_release_source_owner_fk FOREIGN KEY (source_id, customer_id, project_id) REFERENCES webdock_auth.git_source(id, customer_id, project_id);


--
-- Name: git_release git_release_worker_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_release
    ADD CONSTRAINT git_release_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES webdock_auth.git_worker(id);


--
-- Name: git_repository git_repository_connection_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_repository
    ADD CONSTRAINT git_repository_connection_id_customer_id_fkey FOREIGN KEY (connection_id, customer_id) REFERENCES webdock_auth.git_connection(id, customer_id);


--
-- Name: git_source git_source_connection_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_source
    ADD CONSTRAINT git_source_connection_id_customer_id_fkey FOREIGN KEY (connection_id, customer_id) REFERENCES webdock_auth.git_connection(id, customer_id);


--
-- Name: git_source git_source_connection_id_repository_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_source
    ADD CONSTRAINT git_source_connection_id_repository_id_fkey FOREIGN KEY (connection_id, repository_id) REFERENCES webdock_auth.git_repository(connection_id, repository_id);


--
-- Name: git_source git_source_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_source
    ADD CONSTRAINT git_source_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id);


--
-- Name: git_source git_source_project_customer_fk; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_source
    ADD CONSTRAINT git_source_project_customer_fk FOREIGN KEY (project_id, customer_id) REFERENCES webdock_auth.hosting_project(project_id, customer_id);


--
-- Name: git_source git_source_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_source
    ADD CONSTRAINT git_source_project_id_fkey FOREIGN KEY (project_id) REFERENCES webdock_auth.hosting_project(project_id);


--
-- Name: git_vercel_target git_vercel_target_project_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.git_vercel_target
    ADD CONSTRAINT git_vercel_target_project_id_customer_id_fkey FOREIGN KEY (project_id, customer_id) REFERENCES webdock_auth.hosting_project(project_id, customer_id) ON DELETE RESTRICT;


--
-- Name: hosting_agent hosting_agent_cluster_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_agent
    ADD CONSTRAINT hosting_agent_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT;


--
-- Name: hosting_app hosting_app_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_app
    ADD CONSTRAINT hosting_app_project_id_fkey FOREIGN KEY (project_id) REFERENCES webdock_auth.hosting_project(project_id) ON DELETE RESTRICT;


--
-- Name: hosting_byok_policy hosting_byok_policy_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_byok_policy
    ADD CONSTRAINT hosting_byok_policy_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT;


--
-- Name: hosting_cluster hosting_cluster_dedicated_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_cluster
    ADD CONSTRAINT hosting_cluster_dedicated_customer_id_fkey FOREIGN KEY (dedicated_customer_id) REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT;


--
-- Name: hosting_database_backend hosting_database_backend_cluster_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_backend
    ADD CONSTRAINT hosting_database_backend_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT;


--
-- Name: hosting_database hosting_database_backend_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_backend_id_fkey FOREIGN KEY (backend_id) REFERENCES webdock_auth.hosting_database_backend(id);


--
-- Name: hosting_database hosting_database_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id);


--
-- Name: hosting_database_job hosting_database_job_backend_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_job
    ADD CONSTRAINT hosting_database_job_backend_id_fkey FOREIGN KEY (backend_id) REFERENCES webdock_auth.hosting_database_backend(id);


--
-- Name: hosting_database_job hosting_database_job_database_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_job
    ADD CONSTRAINT hosting_database_job_database_id_fkey FOREIGN KEY (database_id) REFERENCES webdock_auth.hosting_database(id);


--
-- Name: hosting_database_job hosting_database_job_migration_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_job
    ADD CONSTRAINT hosting_database_job_migration_id_fkey FOREIGN KEY (migration_id) REFERENCES webdock_auth.hosting_database_migration(id);


--
-- Name: hosting_database_job hosting_database_job_operation_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_job
    ADD CONSTRAINT hosting_database_job_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES webdock_auth.hosting_operation(id);


--
-- Name: hosting_database_job hosting_database_job_source_backend_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_job
    ADD CONSTRAINT hosting_database_job_source_backend_id_fkey FOREIGN KEY (source_backend_id) REFERENCES webdock_auth.hosting_database_backend(id);


--
-- Name: hosting_database_migration hosting_database_migration_database_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_migration
    ADD CONSTRAINT hosting_database_migration_database_id_fkey FOREIGN KEY (database_id) REFERENCES webdock_auth.hosting_database(id);


--
-- Name: hosting_database_migration hosting_database_migration_source_backend_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_migration
    ADD CONSTRAINT hosting_database_migration_source_backend_id_fkey FOREIGN KEY (source_backend_id) REFERENCES webdock_auth.hosting_database_backend(id);


--
-- Name: hosting_database_migration hosting_database_migration_source_order_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_migration
    ADD CONSTRAINT hosting_database_migration_source_order_id_fkey FOREIGN KEY (source_order_id) REFERENCES webdock_auth.hosting_database_order(id);


--
-- Name: hosting_database_migration hosting_database_migration_source_plan_revision_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_migration
    ADD CONSTRAINT hosting_database_migration_source_plan_revision_id_fkey FOREIGN KEY (source_plan_revision_id) REFERENCES webdock_auth.hosting_database_plan(id);


--
-- Name: hosting_database_migration hosting_database_migration_target_backend_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_migration
    ADD CONSTRAINT hosting_database_migration_target_backend_id_fkey FOREIGN KEY (target_backend_id) REFERENCES webdock_auth.hosting_database_backend(id);


--
-- Name: hosting_database_migration hosting_database_migration_target_order_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_migration
    ADD CONSTRAINT hosting_database_migration_target_order_id_fkey FOREIGN KEY (target_order_id) REFERENCES webdock_auth.hosting_database_order(id);


--
-- Name: hosting_database_offer hosting_database_offer_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_offer
    ADD CONSTRAINT hosting_database_offer_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id);


--
-- Name: hosting_database_offer hosting_database_offer_plan_revision_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_offer
    ADD CONSTRAINT hosting_database_offer_plan_revision_id_fkey FOREIGN KEY (plan_revision_id) REFERENCES webdock_auth.hosting_database_plan(id);


--
-- Name: hosting_database_offer hosting_database_offer_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_offer
    ADD CONSTRAINT hosting_database_offer_project_id_fkey FOREIGN KEY (project_id) REFERENCES webdock_admin.projects(id);


--
-- Name: hosting_database hosting_database_operation_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES webdock_auth.hosting_operation(id);


--
-- Name: hosting_database_order hosting_database_order_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_order
    ADD CONSTRAINT hosting_database_order_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id);


--
-- Name: hosting_database_order hosting_database_order_database_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_order
    ADD CONSTRAINT hosting_database_order_database_id_fkey FOREIGN KEY (database_id) REFERENCES webdock_auth.hosting_database(id);


--
-- Name: hosting_database hosting_database_order_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_order_id_fkey FOREIGN KEY (order_id) REFERENCES webdock_auth.hosting_database_order(id);


--
-- Name: hosting_database_order hosting_database_order_offer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_order
    ADD CONSTRAINT hosting_database_order_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES webdock_auth.hosting_database_offer(id);


--
-- Name: hosting_database_order hosting_database_order_plan_revision_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_order
    ADD CONSTRAINT hosting_database_order_plan_revision_id_fkey FOREIGN KEY (plan_revision_id) REFERENCES webdock_auth.hosting_database_plan(id);


--
-- Name: hosting_database_order hosting_database_order_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_order
    ADD CONSTRAINT hosting_database_order_project_id_fkey FOREIGN KEY (project_id) REFERENCES webdock_admin.projects(id);


--
-- Name: hosting_database hosting_database_pending_backend_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_pending_backend_id_fkey FOREIGN KEY (pending_backend_id) REFERENCES webdock_auth.hosting_database_backend(id);


--
-- Name: hosting_database hosting_database_pending_order_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_pending_order_id_fkey FOREIGN KEY (pending_order_id) REFERENCES webdock_auth.hosting_database_order(id);


--
-- Name: hosting_database hosting_database_pending_plan_revision_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_pending_plan_revision_id_fkey FOREIGN KEY (pending_plan_revision_id) REFERENCES webdock_auth.hosting_database_plan(id);


--
-- Name: hosting_database hosting_database_plan_revision_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_plan_revision_id_fkey FOREIGN KEY (plan_revision_id) REFERENCES webdock_auth.hosting_database_plan(id);


--
-- Name: hosting_database_pool hosting_database_pool_cluster_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_pool
    ADD CONSTRAINT hosting_database_pool_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES webdock_auth.hosting_cluster(id);


--
-- Name: hosting_database_port hosting_database_port_backend_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_port
    ADD CONSTRAINT hosting_database_port_backend_id_fkey FOREIGN KEY (backend_id) REFERENCES webdock_auth.hosting_database_backend(id);


--
-- Name: hosting_database_port hosting_database_port_cluster_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_port
    ADD CONSTRAINT hosting_database_port_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES webdock_auth.hosting_cluster(id);


--
-- Name: hosting_database_preview hosting_database_preview_database_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database_preview
    ADD CONSTRAINT hosting_database_preview_database_id_fkey FOREIGN KEY (database_id) REFERENCES webdock_auth.hosting_database(id);


--
-- Name: hosting_database hosting_database_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_database
    ADD CONSTRAINT hosting_database_project_id_fkey FOREIGN KEY (project_id) REFERENCES webdock_admin.projects(id);


--
-- Name: hosting_enrollment hosting_enrollment_cluster_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_enrollment
    ADD CONSTRAINT hosting_enrollment_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT;


--
-- Name: hosting_external_state hosting_external_state_cluster_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_external_state
    ADD CONSTRAINT hosting_external_state_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES webdock_auth.hosting_cluster(id);


--
-- Name: hosting_limit hosting_limit_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_limit
    ADD CONSTRAINT hosting_limit_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT;


--
-- Name: hosting_operation hosting_operation_app_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_operation
    ADD CONSTRAINT hosting_operation_app_id_fkey FOREIGN KEY (app_id) REFERENCES webdock_auth.hosting_app(id) ON DELETE RESTRICT;


--
-- Name: hosting_operation hosting_operation_cluster_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_operation
    ADD CONSTRAINT hosting_operation_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT;


--
-- Name: hosting_operation hosting_operation_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_operation
    ADD CONSTRAINT hosting_operation_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT;


--
-- Name: hosting_operation hosting_operation_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_operation
    ADD CONSTRAINT hosting_operation_project_id_fkey FOREIGN KEY (project_id) REFERENCES webdock_admin.projects(id) ON DELETE RESTRICT;


--
-- Name: hosting_project hosting_project_cluster_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_project
    ADD CONSTRAINT hosting_project_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT;


--
-- Name: hosting_project hosting_project_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_project
    ADD CONSTRAINT hosting_project_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT;


--
-- Name: hosting_project hosting_project_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_project
    ADD CONSTRAINT hosting_project_project_id_fkey FOREIGN KEY (project_id) REFERENCES webdock_admin.projects(id) ON DELETE RESTRICT;


--
-- Name: hosting_reservation hosting_reservation_app_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_reservation
    ADD CONSTRAINT hosting_reservation_app_id_fkey FOREIGN KEY (app_id) REFERENCES webdock_auth.hosting_app(id) ON DELETE RESTRICT;


--
-- Name: hosting_reservation hosting_reservation_cluster_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_reservation
    ADD CONSTRAINT hosting_reservation_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES webdock_auth.hosting_cluster(id) ON DELETE RESTRICT;


--
-- Name: hosting_reservation hosting_reservation_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_reservation
    ADD CONSTRAINT hosting_reservation_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT;


--
-- Name: hosting_reservation hosting_reservation_operation_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_reservation
    ADD CONSTRAINT hosting_reservation_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES webdock_auth.hosting_operation(id) ON DELETE RESTRICT;


--
-- Name: hosting_reservation hosting_reservation_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_reservation
    ADD CONSTRAINT hosting_reservation_project_id_fkey FOREIGN KEY (project_id) REFERENCES webdock_auth.hosting_project(project_id) ON DELETE RESTRICT;


--
-- Name: hosting_service_binding hosting_service_binding_app_id_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_service_binding
    ADD CONSTRAINT hosting_service_binding_app_id_project_id_fkey FOREIGN KEY (app_id, project_id) REFERENCES webdock_auth.hosting_app(id, project_id);


--
-- Name: hosting_service_binding hosting_service_binding_operation_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_service_binding
    ADD CONSTRAINT hosting_service_binding_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES webdock_auth.hosting_operation(id);


--
-- Name: hosting_service_binding hosting_service_binding_project_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_service_binding
    ADD CONSTRAINT hosting_service_binding_project_id_customer_id_fkey FOREIGN KEY (project_id, customer_id) REFERENCES webdock_auth.hosting_project(project_id, customer_id);


--
-- Name: hosting_setup hosting_setup_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_setup
    ADD CONSTRAINT hosting_setup_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id);


--
-- Name: hosting_setup hosting_setup_project_customer_fk; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_setup
    ADD CONSTRAINT hosting_setup_project_customer_fk FOREIGN KEY (project_id, customer_id) REFERENCES webdock_admin.projects(id, customer_id);


--
-- Name: hosting_setup hosting_setup_project_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_setup
    ADD CONSTRAINT hosting_setup_project_id_fkey FOREIGN KEY (project_id) REFERENCES webdock_admin.projects(id);


--
-- Name: hosting_turbosmtp hosting_turbosmtp_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_turbosmtp
    ADD CONSTRAINT hosting_turbosmtp_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT;


--
-- Name: hosting_vercel hosting_vercel_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.hosting_vercel
    ADD CONSTRAINT hosting_vercel_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT;


--
-- Name: invitation invitation_inviterId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.invitation
    ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES webdock_auth."user"(id) ON DELETE CASCADE;


--
-- Name: invitation invitation_organizationId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.invitation
    ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES webdock_auth.organization(id) ON DELETE CASCADE;


--
-- Name: mail_api_key mail_api_key_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_api_key
    ADD CONSTRAINT mail_api_key_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_api_key mail_api_key_customer_id_domain_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_api_key
    ADD CONSTRAINT mail_api_key_customer_id_domain_id_fkey FOREIGN KEY (customer_id, domain_id) REFERENCES webdock_auth.mail_sender_domain(customer_id, id);


--
-- Name: mail_batch mail_batch_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_batch
    ADD CONSTRAINT mail_batch_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_batch_item mail_batch_item_customer_id_connection_id_batch_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_batch_item
    ADD CONSTRAINT mail_batch_item_customer_id_connection_id_batch_id_fkey FOREIGN KEY (customer_id, connection_id, batch_id) REFERENCES webdock_auth.mail_batch(customer_id, connection_id, id);


--
-- Name: mail_batch_item mail_batch_item_customer_id_connection_id_message_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_batch_item
    ADD CONSTRAINT mail_batch_item_customer_id_connection_id_message_id_fkey FOREIGN KEY (customer_id, connection_id, message_id) REFERENCES webdock_auth.mail_message(customer_id, connection_id, id);


--
-- Name: mail_callback_inbox mail_callback_inbox_source_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_callback_inbox
    ADD CONSTRAINT mail_callback_inbox_source_id_fkey FOREIGN KEY (source_id) REFERENCES webdock_auth.mail_callback_source(id);


--
-- Name: mail_callback_source_connection mail_callback_source_connection_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_callback_source_connection
    ADD CONSTRAINT mail_callback_source_connection_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES webdock_auth.mail_connection(id);


--
-- Name: mail_callback_source_connection mail_callback_source_connection_source_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_callback_source_connection
    ADD CONSTRAINT mail_callback_source_connection_source_id_fkey FOREIGN KEY (source_id) REFERENCES webdock_auth.mail_callback_source(id);


--
-- Name: mail_connection mail_connection_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_connection
    ADD CONSTRAINT mail_connection_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: mail_connection_domain mail_connection_domain_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_connection_domain
    ADD CONSTRAINT mail_connection_domain_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_connection_domain mail_connection_domain_customer_id_domain_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_connection_domain
    ADD CONSTRAINT mail_connection_domain_customer_id_domain_id_fkey FOREIGN KEY (customer_id, domain_id) REFERENCES webdock_auth.mail_sender_domain(customer_id, id);


--
-- Name: mail_connection_secret mail_connection_secret_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_connection_secret
    ADD CONSTRAINT mail_connection_secret_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_connection_tracking_settings mail_connection_tracking_setting_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_connection_tracking_settings
    ADD CONSTRAINT mail_connection_tracking_setting_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_event mail_event_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_event
    ADD CONSTRAINT mail_event_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_event mail_event_customer_id_connection_id_message_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_event
    ADD CONSTRAINT mail_event_customer_id_connection_id_message_id_fkey FOREIGN KEY (customer_id, connection_id, message_id) REFERENCES webdock_auth.mail_message(customer_id, connection_id, id);


--
-- Name: mail_idempotency mail_idempotency_customer_id_connection_id_batch_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_idempotency
    ADD CONSTRAINT mail_idempotency_customer_id_connection_id_batch_id_fkey FOREIGN KEY (customer_id, connection_id, batch_id) REFERENCES webdock_auth.mail_batch(customer_id, connection_id, id);


--
-- Name: mail_idempotency mail_idempotency_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_idempotency
    ADD CONSTRAINT mail_idempotency_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_idempotency mail_idempotency_customer_id_connection_id_message_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_idempotency
    ADD CONSTRAINT mail_idempotency_customer_id_connection_id_message_id_fkey FOREIGN KEY (customer_id, connection_id, message_id) REFERENCES webdock_auth.mail_message(customer_id, connection_id, id);


--
-- Name: mail_import_map mail_import_map_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_import_map
    ADD CONSTRAINT mail_import_map_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_message_content mail_message_content_customer_id_connection_id_message_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_message_content
    ADD CONSTRAINT mail_message_content_customer_id_connection_id_message_id_fkey FOREIGN KEY (customer_id, connection_id, message_id) REFERENCES webdock_auth.mail_message(customer_id, connection_id, id) ON DELETE CASCADE;


--
-- Name: mail_message mail_message_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_message
    ADD CONSTRAINT mail_message_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_message mail_message_customer_id_domain_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_message
    ADD CONSTRAINT mail_message_customer_id_domain_id_fkey FOREIGN KEY (customer_id, domain_id) REFERENCES webdock_auth.mail_sender_domain(customer_id, id);


--
-- Name: mail_provider_operation mail_provider_operation_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_provider_operation
    ADD CONSTRAINT mail_provider_operation_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_rate_window mail_rate_window_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_rate_window
    ADD CONSTRAINT mail_rate_window_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: mail_recipient mail_recipient_customer_id_connection_id_message_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_recipient
    ADD CONSTRAINT mail_recipient_customer_id_connection_id_message_id_fkey FOREIGN KEY (customer_id, connection_id, message_id) REFERENCES webdock_auth.mail_message(customer_id, connection_id, id) ON DELETE CASCADE;


--
-- Name: mail_request_log mail_request_log_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_request_log
    ADD CONSTRAINT mail_request_log_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_request_log mail_request_log_customer_id_connection_id_key_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_request_log
    ADD CONSTRAINT mail_request_log_customer_id_connection_id_key_id_fkey FOREIGN KEY (customer_id, connection_id, key_id) REFERENCES webdock_auth.mail_api_key(customer_id, connection_id, id);


--
-- Name: mail_sender_domain mail_sender_domain_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_sender_domain
    ADD CONSTRAINT mail_sender_domain_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: mail_suppression mail_suppression_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_suppression
    ADD CONSTRAINT mail_suppression_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: mail_tenant_account mail_tenant_account_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tenant_account
    ADD CONSTRAINT mail_tenant_account_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: mail_tracking_domain mail_tracking_domain_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tracking_domain
    ADD CONSTRAINT mail_tracking_domain_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES webdock_auth.mail_connection(id);


--
-- Name: mail_tracking_domain mail_tracking_domain_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tracking_domain
    ADD CONSTRAINT mail_tracking_domain_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: mail_tracking_domain mail_tracking_domain_sender_domain_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tracking_domain
    ADD CONSTRAINT mail_tracking_domain_sender_domain_id_fkey FOREIGN KEY (sender_domain_id) REFERENCES webdock_auth.mail_sender_domain(id);


--
-- Name: mail_tracking_operation mail_tracking_operation_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tracking_operation
    ADD CONSTRAINT mail_tracking_operation_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: mail_tracking_settings mail_tracking_settings_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_tracking_settings
    ADD CONSTRAINT mail_tracking_settings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: mail_usage_period mail_usage_period_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_usage_period
    ADD CONSTRAINT mail_usage_period_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_usage_reservation mail_usage_reservation_customer_id_connection_id_message_i_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_usage_reservation
    ADD CONSTRAINT mail_usage_reservation_customer_id_connection_id_message_i_fkey FOREIGN KEY (customer_id, connection_id, message_id) REFERENCES webdock_auth.mail_message(customer_id, connection_id, id);


--
-- Name: mail_usage_reservation mail_usage_reservation_customer_id_connection_id_period_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_usage_reservation
    ADD CONSTRAINT mail_usage_reservation_customer_id_connection_id_period_fkey FOREIGN KEY (customer_id, connection_id, period) REFERENCES webdock_auth.mail_usage_period(customer_id, connection_id, period);


--
-- Name: mail_webhook_attempt mail_webhook_attempt_customer_id_connection_id_delivery_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_webhook_attempt
    ADD CONSTRAINT mail_webhook_attempt_customer_id_connection_id_delivery_id_fkey FOREIGN KEY (customer_id, connection_id, delivery_id) REFERENCES webdock_auth.mail_webhook_delivery(customer_id, connection_id, id) ON DELETE CASCADE;


--
-- Name: mail_webhook mail_webhook_customer_id_connection_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_webhook
    ADD CONSTRAINT mail_webhook_customer_id_connection_id_fkey FOREIGN KEY (customer_id, connection_id) REFERENCES webdock_auth.mail_connection(customer_id, id);


--
-- Name: mail_webhook_delivery mail_webhook_delivery_customer_id_connection_id_event_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_webhook_delivery
    ADD CONSTRAINT mail_webhook_delivery_customer_id_connection_id_event_id_fkey FOREIGN KEY (customer_id, connection_id, event_id) REFERENCES webdock_auth.mail_event(customer_id, connection_id, id);


--
-- Name: mail_webhook_delivery mail_webhook_delivery_customer_id_connection_id_webhook_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.mail_webhook_delivery
    ADD CONSTRAINT mail_webhook_delivery_customer_id_connection_id_webhook_id_fkey FOREIGN KEY (customer_id, connection_id, webhook_id) REFERENCES webdock_auth.mail_webhook(customer_id, connection_id, id);


--
-- Name: managed_database_launch managed_database_launch_backend_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.managed_database_launch
    ADD CONSTRAINT managed_database_launch_backend_id_fkey FOREIGN KEY (backend_id) REFERENCES webdock_auth.hosting_database_backend(id);


--
-- Name: managed_database_launch managed_database_launch_database_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.managed_database_launch
    ADD CONSTRAINT managed_database_launch_database_id_fkey FOREIGN KEY (database_id) REFERENCES webdock_auth.hosting_database(id);


--
-- Name: managed_database_launch managed_database_launch_session_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.managed_database_launch
    ADD CONSTRAINT managed_database_launch_session_id_fkey FOREIGN KEY (session_id) REFERENCES webdock_auth.session(id) ON DELETE CASCADE;


--
-- Name: managed_database_launch managed_database_launch_subject_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.managed_database_launch
    ADD CONSTRAINT managed_database_launch_subject_fkey FOREIGN KEY (subject) REFERENCES webdock_auth."user"(id);


--
-- Name: managed_database_session managed_database_session_backend_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.managed_database_session
    ADD CONSTRAINT managed_database_session_backend_id_fkey FOREIGN KEY (backend_id) REFERENCES webdock_auth.hosting_database_backend(id);


--
-- Name: managed_database_session managed_database_session_database_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.managed_database_session
    ADD CONSTRAINT managed_database_session_database_id_fkey FOREIGN KEY (database_id) REFERENCES webdock_auth.hosting_database(id);


--
-- Name: managed_database_session managed_database_session_session_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.managed_database_session
    ADD CONSTRAINT managed_database_session_session_id_fkey FOREIGN KEY (session_id) REFERENCES webdock_auth.session(id) ON DELETE CASCADE;


--
-- Name: managed_database_session managed_database_session_subject_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.managed_database_session
    ADD CONSTRAINT managed_database_session_subject_fkey FOREIGN KEY (subject) REFERENCES webdock_auth."user"(id);


--
-- Name: member member_organizationId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.member
    ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES webdock_auth.organization(id) ON DELETE CASCADE;


--
-- Name: member member_userId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.member
    ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES webdock_auth."user"(id) ON DELETE CASCADE;


--
-- Name: oauthAccessToken oauthAccessToken_clientId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES webdock_auth."oauthClient"("clientId") ON DELETE CASCADE;


--
-- Name: oauthAccessToken oauthAccessToken_refreshId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES webdock_auth."oauthRefreshToken"(id) ON DELETE CASCADE;


--
-- Name: oauthAccessToken oauthAccessToken_sessionId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES webdock_auth.session(id) ON DELETE SET NULL;


--
-- Name: oauthAccessToken oauthAccessToken_userId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES webdock_auth."user"(id) ON DELETE CASCADE;


--
-- Name: oauthClientResource oauthClientResource_clientId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthClientResource"
    ADD CONSTRAINT "oauthClientResource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES webdock_auth."oauthClient"("clientId") ON DELETE CASCADE;


--
-- Name: oauthClientResource oauthClientResource_resourceId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthClientResource"
    ADD CONSTRAINT "oauthClientResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES webdock_auth."oauthResource"(identifier) ON DELETE CASCADE;


--
-- Name: oauthClient oauthClient_userId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthClient"
    ADD CONSTRAINT "oauthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES webdock_auth."user"(id) ON DELETE CASCADE;


--
-- Name: oauthConsent oauthConsent_clientId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthConsent"
    ADD CONSTRAINT "oauthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES webdock_auth."oauthClient"("clientId") ON DELETE CASCADE;


--
-- Name: oauthConsent oauthConsent_userId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthConsent"
    ADD CONSTRAINT "oauthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES webdock_auth."user"(id) ON DELETE CASCADE;


--
-- Name: oauthRefreshToken oauthRefreshToken_clientId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthRefreshToken"
    ADD CONSTRAINT "oauthRefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES webdock_auth."oauthClient"("clientId") ON DELETE CASCADE;


--
-- Name: oauthRefreshToken oauthRefreshToken_sessionId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthRefreshToken"
    ADD CONSTRAINT "oauthRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES webdock_auth.session(id) ON DELETE SET NULL;


--
-- Name: oauthRefreshToken oauthRefreshToken_userId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."oauthRefreshToken"
    ADD CONSTRAINT "oauthRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES webdock_auth."user"(id) ON DELETE CASCADE;


--
-- Name: passkey passkey_userId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.passkey
    ADD CONSTRAINT "passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES webdock_auth."user"(id) ON DELETE CASCADE;


--
-- Name: plan_offer plan_offer_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.plan_offer
    ADD CONSTRAINT plan_offer_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id) ON DELETE RESTRICT;


--
-- Name: plan_offer plan_offer_plan_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.plan_offer
    ADD CONSTRAINT plan_offer_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES webdock_auth.plan_template(id);


--
-- Name: project_grant project_grant_binding_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.project_grant
    ADD CONSTRAINT project_grant_binding_id_fkey FOREIGN KEY (binding_id) REFERENCES webdock_auth.app_binding(id);


--
-- Name: project_grant project_grant_organization_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.project_grant
    ADD CONSTRAINT project_grant_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES webdock_auth.organization(id);


--
-- Name: project_grant project_grant_user_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.project_grant
    ADD CONSTRAINT project_grant_user_id_fkey FOREIGN KEY (user_id) REFERENCES webdock_auth."user"(id);


--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES webdock_auth."user"(id) ON DELETE CASCADE;


--
-- Name: studio_tenant_preview studio_tenant_preview_actor_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.studio_tenant_preview
    ADD CONSTRAINT studio_tenant_preview_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES webdock_auth."user"(id) ON DELETE CASCADE;


--
-- Name: studio_tenant_preview studio_tenant_preview_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.studio_tenant_preview
    ADD CONSTRAINT studio_tenant_preview_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT;


--
-- Name: studio_tenant_preview studio_tenant_preview_session_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.studio_tenant_preview
    ADD CONSTRAINT studio_tenant_preview_session_id_fkey FOREIGN KEY (session_id) REFERENCES webdock_auth.session(id) ON DELETE CASCADE;


--
-- Name: subscription_history subscription_history_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.subscription_history
    ADD CONSTRAINT subscription_history_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id) ON DELETE RESTRICT;


--
-- Name: subscription_history subscription_history_plan_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.subscription_history
    ADD CONSTRAINT subscription_history_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES webdock_auth.plan_template(id);


--
-- Name: tenant_customer tenant_customer_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.tenant_customer
    ADD CONSTRAINT tenant_customer_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_admin.customers(id) ON DELETE RESTRICT;


--
-- Name: tenant_customer tenant_customer_organization_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.tenant_customer
    ADD CONSTRAINT tenant_customer_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES webdock_auth.organization(id) ON DELETE RESTRICT;


--
-- Name: tenant_storage tenant_storage_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.tenant_storage
    ADD CONSTRAINT tenant_storage_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: tenant_subscription tenant_subscription_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.tenant_subscription
    ADD CONSTRAINT tenant_subscription_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id) ON DELETE RESTRICT;


--
-- Name: tenant_subscription tenant_subscription_plan_id_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth.tenant_subscription
    ADD CONSTRAINT tenant_subscription_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES webdock_auth.plan_template(id);


--
-- Name: twoFactor twoFactor_userId_fkey; Type: FK CONSTRAINT; Schema: webdock_auth; Owner: -
--

ALTER TABLE ONLY webdock_auth."twoFactor"
    ADD CONSTRAINT "twoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES webdock_auth."user"(id) ON DELETE CASCADE;


--
-- Name: access_event access_event_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.access_event
    ADD CONSTRAINT access_event_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_mail.service(customer_id);


--
-- Name: access_event access_event_subject_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.access_event
    ADD CONSTRAINT access_event_subject_fkey FOREIGN KEY (subject) REFERENCES webdock_auth."user"(id);


--
-- Name: api_key api_key_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.api_key
    ADD CONSTRAINT api_key_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: api_key api_key_domain_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.api_key
    ADD CONSTRAINT api_key_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES webdock_auth.mail_sender_domain(id) ON DELETE SET NULL;


--
-- Name: budget_reservation budget_reservation_customer_id_period_start_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.budget_reservation
    ADD CONSTRAINT budget_reservation_customer_id_period_start_fkey FOREIGN KEY (customer_id, period_start) REFERENCES webdock_mail.month_usage(customer_id, period_start);


--
-- Name: cluster_reservation cluster_reservation_cluster_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.cluster_reservation
    ADD CONSTRAINT cluster_reservation_cluster_id_fkey FOREIGN KEY (cluster_id) REFERENCES webdock_auth.hosting_cluster(id);


--
-- Name: cluster_reservation cluster_reservation_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.cluster_reservation
    ADD CONSTRAINT cluster_reservation_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_mail.service(customer_id);


--
-- Name: configuration configuration_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.configuration
    ADD CONSTRAINT configuration_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_mail.service(customer_id);


--
-- Name: configuration_operation configuration_operation_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.configuration_operation
    ADD CONSTRAINT configuration_operation_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_mail.service(customer_id);


--
-- Name: configuration_operation configuration_operation_requested_by_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.configuration_operation
    ADD CONSTRAINT configuration_operation_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES webdock_auth."user"(id);


--
-- Name: domain domain_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.domain
    ADD CONSTRAINT domain_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_mail.service(customer_id);


--
-- Name: domain domain_sender_domain_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.domain
    ADD CONSTRAINT domain_sender_domain_id_fkey FOREIGN KEY (sender_domain_id) REFERENCES webdock_auth.mail_sender_domain(id) ON DELETE RESTRICT;


--
-- Name: identity identity_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.identity
    ADD CONSTRAINT identity_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_mail.service(customer_id);


--
-- Name: identity identity_subject_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.identity
    ADD CONSTRAINT identity_subject_fkey FOREIGN KEY (subject) REFERENCES webdock_auth."user"(id);


--
-- Name: instance instance_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.instance
    ADD CONSTRAINT instance_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_mail.service(customer_id);


--
-- Name: domain mail_domain_sender_tenant; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.domain
    ADD CONSTRAINT mail_domain_sender_tenant FOREIGN KEY (customer_id, sender_domain_id) REFERENCES webdock_auth.mail_sender_domain(customer_id, id);


--
-- Name: mailbox mailbox_customer_id_domain_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.mailbox
    ADD CONSTRAINT mailbox_customer_id_domain_id_fkey FOREIGN KEY (customer_id, domain_id) REFERENCES webdock_mail.domain(customer_id, id);


--
-- Name: mailbox mailbox_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.mailbox
    ADD CONSTRAINT mailbox_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_mail.service(customer_id);


--
-- Name: mailbox_grant mailbox_grant_customer_id_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.mailbox_grant
    ADD CONSTRAINT mailbox_grant_customer_id_mailbox_id_fkey FOREIGN KEY (customer_id, mailbox_id) REFERENCES webdock_mail.mailbox(customer_id, id);


--
-- Name: mailbox_grant mailbox_grant_customer_id_subject_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.mailbox_grant
    ADD CONSTRAINT mailbox_grant_customer_id_subject_fkey FOREIGN KEY (customer_id, subject) REFERENCES webdock_mail.identity(customer_id, subject);


--
-- Name: mailbox_grant mailbox_grant_member_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.mailbox_grant
    ADD CONSTRAINT mailbox_grant_member_id_fkey FOREIGN KEY (member_id) REFERENCES webdock_auth.member(id) ON DELETE SET NULL;


--
-- Name: month_usage month_usage_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.month_usage
    ADD CONSTRAINT month_usage_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: operation operation_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.operation
    ADD CONSTRAINT operation_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_mail.service(customer_id);


--
-- Name: operation operation_requested_by_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.operation
    ADD CONSTRAINT operation_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES webdock_auth."user"(id);


--
-- Name: send_job send_job_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.send_job
    ADD CONSTRAINT send_job_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: send_transport send_transport_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.send_transport
    ADD CONSTRAINT send_transport_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: service service_customer_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.service
    ADD CONSTRAINT service_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES webdock_auth.tenant_customer(customer_id);


--
-- Name: webmail_launch webmail_launch_customer_id_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_launch
    ADD CONSTRAINT webmail_launch_customer_id_mailbox_id_fkey FOREIGN KEY (customer_id, mailbox_id) REFERENCES webdock_mail.mailbox(customer_id, id);


--
-- Name: webmail_launch webmail_launch_mailbox_id_subject_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_launch
    ADD CONSTRAINT webmail_launch_mailbox_id_subject_fkey FOREIGN KEY (mailbox_id, subject) REFERENCES webdock_mail.mailbox_grant(mailbox_id, subject);


--
-- Name: webmail_launch webmail_launch_session_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_launch
    ADD CONSTRAINT webmail_launch_session_id_fkey FOREIGN KEY (session_id) REFERENCES webdock_auth.session(id) ON DELETE CASCADE;


--
-- Name: webmail_session webmail_session_customer_id_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_session
    ADD CONSTRAINT webmail_session_customer_id_mailbox_id_fkey FOREIGN KEY (customer_id, mailbox_id) REFERENCES webdock_mail.mailbox(customer_id, id);


--
-- Name: webmail_session webmail_session_mailbox_id_subject_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_session
    ADD CONSTRAINT webmail_session_mailbox_id_subject_fkey FOREIGN KEY (mailbox_id, subject) REFERENCES webdock_mail.mailbox_grant(mailbox_id, subject);


--
-- Name: webmail_session webmail_session_session_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_session
    ADD CONSTRAINT webmail_session_session_id_fkey FOREIGN KEY (session_id) REFERENCES webdock_auth.session(id) ON DELETE CASCADE;


--
-- Name: webmail_write webmail_write_customer_id_mailbox_id_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_write
    ADD CONSTRAINT webmail_write_customer_id_mailbox_id_fkey FOREIGN KEY (customer_id, mailbox_id) REFERENCES webdock_mail.mailbox(customer_id, id);


--
-- Name: webmail_write webmail_write_subject_fkey; Type: FK CONSTRAINT; Schema: webdock_mail; Owner: -
--

ALTER TABLE ONLY webdock_mail.webmail_write
    ADD CONSTRAINT webmail_write_subject_fkey FOREIGN KEY (subject) REFERENCES webdock_auth."user"(id);


--
-- PostgreSQL database dump complete
--


