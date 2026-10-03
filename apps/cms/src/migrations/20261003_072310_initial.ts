import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('super-admin', 'editor', 'site-reader');
  CREATE TYPE "public"."enum__users_v_version_role" AS ENUM('super-admin', 'editor', 'site-reader');
  CREATE TABLE "users_tenants" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "tenant_id" integer NOT NULL
  );

  CREATE TABLE "users_sessions" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "created_at" timestamp(3) with time zone,
    "expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "users" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "role" "enum_users_role" DEFAULT 'editor' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "email" varchar NOT NULL,
    "reset_password_token" varchar,
    "reset_password_expiration" timestamp(3) with time zone,
    "salt" varchar,
    "hash" varchar,
    "reset_password_requested_at" timestamp(3) with time zone,
    "login_attempts" numeric DEFAULT 0,
    "lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "_users_v_version_tenants" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer NOT NULL,
    "_uuid" varchar
  );

  CREATE TABLE "_users_v_version_sessions" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "_uuid" varchar NOT NULL,
    "created_at" timestamp(3) with time zone,
    "expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "_users_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_name" varchar,
    "version_role" "enum__users_v_version_role" DEFAULT 'editor' NOT NULL,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version_email" varchar NOT NULL,
    "version_reset_password_token" varchar,
    "version_reset_password_expiration" timestamp(3) with time zone,
    "version_salt" varchar,
    "version_hash" varchar,
    "version_reset_password_requested_at" timestamp(3) with time zone,
    "version_login_attempts" numeric DEFAULT 0,
    "version_lock_until" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "tenants" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "slug" varchar NOT NULL,
    "domain" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_tenants_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_name" varchar NOT NULL,
    "version_slug" varchar NOT NULL,
    "version_domain" varchar NOT NULL,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "landing_pages_use_cases" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "title" varchar NOT NULL,
    "description" varchar NOT NULL
  );

  CREATE TABLE "landing_pages_faqs" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "question" varchar NOT NULL,
    "answer" varchar NOT NULL
  );

  CREATE TABLE "landing_pages" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "seo_title" varchar DEFAULT 'Webdock — Project previews & client websites by Spitzli' NOT NULL,
    "seo_description" varchar DEFAULT 'Your project. Well docked. A home for project previews and client websites by Spitzli Development — on a Webdock subdomain or your own domain.' NOT NULL,
    "contact_email" varchar DEFAULT 'dominik@spitzli.dev' NOT NULL,
    "hero_title" varchar DEFAULT 'Your project.
  Well docked.' NOT NULL,
    "hero_description" varchar DEFAULT 'From the first preview to the finished website. Webdock gives your project a place to call home.' NOT NULL,
    "hero_button" varchar DEFAULT 'Let’s get you docked' NOT NULL,
    "hero_note" varchar DEFAULT 'Your subdomain. Or your own domain.' NOT NULL,
    "concept_title" varchar DEFAULT 'From “take a look”
  to “we’re live”.' NOT NULL,
    "concept_description" varchar DEFAULT 'Some projects need a link to get started. Others need a lasting home. Webdock is here for both.' NOT NULL,
    "about_title" varchar DEFAULT 'A home online.
  A human on your side.' NOT NULL,
    "about_description" varchar DEFAULT 'Webdock is run by Dominik at Spitzli Development. From the first idea to deployment, you work directly with the person building your project.' NOT NULL,
    "faq_title" varchar DEFAULT 'Good questions.
  Straight answers.' NOT NULL,
    "outlook_title" varchar DEFAULT 'Your link today. Your dashboard tomorrow.' NOT NULL,
    "outlook_description" varchar DEFAULT 'A dedicated console for your projects is planned. Until then, we’ll take care of things personally.' NOT NULL,
    "closing_title" varchar DEFAULT 'There’s a place
  for your next idea.' NOT NULL,
    "closing_button" varchar DEFAULT 'Let’s talk about it' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_landing_pages_v_version_use_cases" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar NOT NULL,
    "description" varchar NOT NULL,
    "_uuid" varchar
  );

  CREATE TABLE "_landing_pages_v_version_faqs" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "question" varchar NOT NULL,
    "answer" varchar NOT NULL,
    "_uuid" varchar
  );

  CREATE TABLE "_landing_pages_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_tenant_id" integer,
    "version_seo_title" varchar DEFAULT 'Webdock — Project previews & client websites by Spitzli' NOT NULL,
    "version_seo_description" varchar DEFAULT 'Your project. Well docked. A home for project previews and client websites by Spitzli Development — on a Webdock subdomain or your own domain.' NOT NULL,
    "version_contact_email" varchar DEFAULT 'dominik@spitzli.dev' NOT NULL,
    "version_hero_title" varchar DEFAULT 'Your project.
  Well docked.' NOT NULL,
    "version_hero_description" varchar DEFAULT 'From the first preview to the finished website. Webdock gives your project a place to call home.' NOT NULL,
    "version_hero_button" varchar DEFAULT 'Let’s get you docked' NOT NULL,
    "version_hero_note" varchar DEFAULT 'Your subdomain. Or your own domain.' NOT NULL,
    "version_concept_title" varchar DEFAULT 'From “take a look”
  to “we’re live”.' NOT NULL,
    "version_concept_description" varchar DEFAULT 'Some projects need a link to get started. Others need a lasting home. Webdock is here for both.' NOT NULL,
    "version_about_title" varchar DEFAULT 'A home online.
  A human on your side.' NOT NULL,
    "version_about_description" varchar DEFAULT 'Webdock is run by Dominik at Spitzli Development. From the first idea to deployment, you work directly with the person building your project.' NOT NULL,
    "version_faq_title" varchar DEFAULT 'Good questions.
  Straight answers.' NOT NULL,
    "version_outlook_title" varchar DEFAULT 'Your link today. Your dashboard tomorrow.' NOT NULL,
    "version_outlook_description" varchar DEFAULT 'A dedicated console for your projects is planned. Until then, we’ll take care of things personally.' NOT NULL,
    "version_closing_title" varchar DEFAULT 'There’s a place
  for your next idea.' NOT NULL,
    "version_closing_button" varchar DEFAULT 'Let’s talk about it' NOT NULL,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_kv" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "data" jsonb NOT NULL
  );

  CREATE TABLE "payload_locked_documents" (
    "id" serial PRIMARY KEY NOT NULL,
    "global_slug" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_locked_documents_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "users_id" integer,
    "tenants_id" integer,
    "landing_pages_id" integer
  );

  CREATE TABLE "payload_preferences" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar,
    "value" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_preferences_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "users_id" integer
  );

  CREATE TABLE "payload_migrations" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "batch" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_tenants" ADD CONSTRAINT "users_tenants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_users_v_version_tenants" ADD CONSTRAINT "_users_v_version_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_users_v_version_tenants" ADD CONSTRAINT "_users_v_version_tenants_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_users_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_users_v_version_sessions" ADD CONSTRAINT "_users_v_version_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_users_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_users_v" ADD CONSTRAINT "_users_v_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_tenants_v" ADD CONSTRAINT "_tenants_v_parent_id_tenants_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landing_pages_use_cases" ADD CONSTRAINT "landing_pages_use_cases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landing_pages_faqs" ADD CONSTRAINT "landing_pages_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_pages_v_version_use_cases" ADD CONSTRAINT "_landing_pages_v_version_use_cases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_pages_v_version_faqs" ADD CONSTRAINT "_landing_pages_v_version_faqs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_pages_v" ADD CONSTRAINT "_landing_pages_v_parent_id_landing_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."landing_pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_pages_v" ADD CONSTRAINT "_landing_pages_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tenants_fk" FOREIGN KEY ("tenants_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_landing_pages_fk" FOREIGN KEY ("landing_pages_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_tenants_order_idx" ON "users_tenants" USING btree ("_order");
  CREATE INDEX "users_tenants_parent_id_idx" ON "users_tenants" USING btree ("_parent_id");
  CREATE INDEX "users_tenants_tenant_idx" ON "users_tenants" USING btree ("tenant_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "_users_v_version_tenants_order_idx" ON "_users_v_version_tenants" USING btree ("_order");
  CREATE INDEX "_users_v_version_tenants_parent_id_idx" ON "_users_v_version_tenants" USING btree ("_parent_id");
  CREATE INDEX "_users_v_version_tenants_tenant_idx" ON "_users_v_version_tenants" USING btree ("tenant_id");
  CREATE INDEX "_users_v_version_sessions_order_idx" ON "_users_v_version_sessions" USING btree ("_order");
  CREATE INDEX "_users_v_version_sessions_parent_id_idx" ON "_users_v_version_sessions" USING btree ("_parent_id");
  CREATE INDEX "_users_v_parent_idx" ON "_users_v" USING btree ("parent_id");
  CREATE INDEX "_users_v_version_version_updated_at_idx" ON "_users_v" USING btree ("version_updated_at");
  CREATE INDEX "_users_v_version_version_created_at_idx" ON "_users_v" USING btree ("version_created_at");
  CREATE INDEX "_users_v_version_version_email_idx" ON "_users_v" USING btree ("version_email");
  CREATE INDEX "_users_v_created_at_idx" ON "_users_v" USING btree ("created_at");
  CREATE INDEX "_users_v_updated_at_idx" ON "_users_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "tenants_slug_idx" ON "tenants" USING btree ("slug");
  CREATE INDEX "tenants_updated_at_idx" ON "tenants" USING btree ("updated_at");
  CREATE INDEX "tenants_created_at_idx" ON "tenants" USING btree ("created_at");
  CREATE INDEX "_tenants_v_parent_idx" ON "_tenants_v" USING btree ("parent_id");
  CREATE INDEX "_tenants_v_version_version_slug_idx" ON "_tenants_v" USING btree ("version_slug");
  CREATE INDEX "_tenants_v_version_version_updated_at_idx" ON "_tenants_v" USING btree ("version_updated_at");
  CREATE INDEX "_tenants_v_version_version_created_at_idx" ON "_tenants_v" USING btree ("version_created_at");
  CREATE INDEX "_tenants_v_created_at_idx" ON "_tenants_v" USING btree ("created_at");
  CREATE INDEX "_tenants_v_updated_at_idx" ON "_tenants_v" USING btree ("updated_at");
  CREATE INDEX "landing_pages_use_cases_order_idx" ON "landing_pages_use_cases" USING btree ("_order");
  CREATE INDEX "landing_pages_use_cases_parent_id_idx" ON "landing_pages_use_cases" USING btree ("_parent_id");
  CREATE INDEX "landing_pages_faqs_order_idx" ON "landing_pages_faqs" USING btree ("_order");
  CREATE INDEX "landing_pages_faqs_parent_id_idx" ON "landing_pages_faqs" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "landing_pages_tenant_idx" ON "landing_pages" USING btree ("tenant_id");
  CREATE INDEX "landing_pages_updated_at_idx" ON "landing_pages" USING btree ("updated_at");
  CREATE INDEX "landing_pages_created_at_idx" ON "landing_pages" USING btree ("created_at");
  CREATE INDEX "_landing_pages_v_version_use_cases_order_idx" ON "_landing_pages_v_version_use_cases" USING btree ("_order");
  CREATE INDEX "_landing_pages_v_version_use_cases_parent_id_idx" ON "_landing_pages_v_version_use_cases" USING btree ("_parent_id");
  CREATE INDEX "_landing_pages_v_version_faqs_order_idx" ON "_landing_pages_v_version_faqs" USING btree ("_order");
  CREATE INDEX "_landing_pages_v_version_faqs_parent_id_idx" ON "_landing_pages_v_version_faqs" USING btree ("_parent_id");
  CREATE INDEX "_landing_pages_v_parent_idx" ON "_landing_pages_v" USING btree ("parent_id");
  CREATE INDEX "_landing_pages_v_version_version_tenant_idx" ON "_landing_pages_v" USING btree ("version_tenant_id");
  CREATE INDEX "_landing_pages_v_version_version_updated_at_idx" ON "_landing_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_landing_pages_v_version_version_created_at_idx" ON "_landing_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_landing_pages_v_created_at_idx" ON "_landing_pages_v" USING btree ("created_at");
  CREATE INDEX "_landing_pages_v_updated_at_idx" ON "_landing_pages_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_tenants_id_idx" ON "payload_locked_documents_rels" USING btree ("tenants_id");
  CREATE INDEX "payload_locked_documents_rels_landing_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("landing_pages_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_tenants" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "_users_v_version_tenants" CASCADE;
  DROP TABLE "_users_v_version_sessions" CASCADE;
  DROP TABLE "_users_v" CASCADE;
  DROP TABLE "tenants" CASCADE;
  DROP TABLE "_tenants_v" CASCADE;
  DROP TABLE "landing_pages_use_cases" CASCADE;
  DROP TABLE "landing_pages_faqs" CASCADE;
  DROP TABLE "landing_pages" CASCADE;
  DROP TABLE "_landing_pages_v_version_use_cases" CASCADE;
  DROP TABLE "_landing_pages_v_version_faqs" CASCADE;
  DROP TABLE "_landing_pages_v" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum__users_v_version_role";`)
}
