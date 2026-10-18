import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "app"."_locales" AS ENUM('en', 'de');
  CREATE TYPE "app"."enum_users_role" AS ENUM('operator', 'admin', 'editor', 'reader');
  CREATE TYPE "app"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "app"."enum__pages_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "app"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "app"."enum_settings_status" AS ENUM('draft', 'published');
  CREATE TYPE "app"."enum__settings_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "app"."enum__settings_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "app"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "app"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"auth_subject" varchar,
  	"name" varchar,
  	"disabled" boolean DEFAULT false,
  	"role" "app"."enum_users_role" DEFAULT 'editor' NOT NULL,
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
  
  CREATE TABLE "app"."pages_blocks_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"text" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "app"."pages_blocks_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"caption" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "app"."pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "app"."pages_locales" (
  	"title" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"_status" "app"."enum_pages_status" DEFAULT 'draft',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "app"."_pages_v_blocks_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"text" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "app"."_pages_v_blocks_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"caption" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "app"."_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"published_locale" "app"."enum__pages_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "app"."_pages_v_locales" (
  	"version_title" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version__status" "app"."enum__pages_v_version_status" DEFAULT 'draft',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "app"."media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "app"."media_locales" (
  	"alt" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "app"."_media_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_url" varchar,
  	"version_thumbnail_u_r_l" varchar,
  	"version_filename" varchar,
  	"version_mime_type" varchar,
  	"version_filesize" numeric,
  	"version_width" numeric,
  	"version_height" numeric,
  	"version_focal_x" numeric,
  	"version_focal_y" numeric,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "app"."_media_v_locales" (
  	"version_alt" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "app"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "app"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "app"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"pages_id" integer,
  	"media_id" integer
  );
  
  CREATE TABLE "app"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "app"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "app"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "app"."settings_navigation" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"page_id" integer
  );
  
  CREATE TABLE "app"."settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "app"."settings_locales" (
  	"title" varchar,
  	"description" varchar,
  	"_status" "app"."enum_settings_status" DEFAULT 'draft',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "app"."_settings_v_version_navigation" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"page_id" integer,
  	"_uuid" varchar
  );
  
  CREATE TABLE "app"."_settings_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"published_locale" "app"."enum__settings_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "app"."_settings_v_locales" (
  	"version_title" varchar,
  	"version_description" varchar,
  	"version__status" "app"."enum__settings_v_version_status" DEFAULT 'draft',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "app"."_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "app"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."pages_blocks_text" ADD CONSTRAINT "pages_blocks_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."pages_blocks_image" ADD CONSTRAINT "pages_blocks_image_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "app"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app"."pages_blocks_image" ADD CONSTRAINT "pages_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."_pages_v_blocks_text" ADD CONSTRAINT "_pages_v_blocks_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."_pages_v_blocks_image" ADD CONSTRAINT "_pages_v_blocks_image_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "app"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app"."_pages_v_blocks_image" ADD CONSTRAINT "_pages_v_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "app"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app"."_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."_media_v" ADD CONSTRAINT "_media_v_parent_id_media_id_fk" FOREIGN KEY ("parent_id") REFERENCES "app"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app"."_media_v_locales" ADD CONSTRAINT "_media_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."_media_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "app"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "app"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "app"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "app"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "app"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."settings_navigation" ADD CONSTRAINT "settings_navigation_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "app"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app"."settings_navigation" ADD CONSTRAINT "settings_navigation_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."settings_locales" ADD CONSTRAINT "settings_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."_settings_v_version_navigation" ADD CONSTRAINT "_settings_v_version_navigation_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "app"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app"."_settings_v_version_navigation" ADD CONSTRAINT "_settings_v_version_navigation_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app"."_settings_v_locales" ADD CONSTRAINT "_settings_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "app"."_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "app"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "app"."users_sessions" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "users_auth_subject_idx" ON "app"."users" USING btree ("auth_subject");
  CREATE INDEX "users_updated_at_idx" ON "app"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "app"."users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "app"."users" USING btree ("email");
  CREATE INDEX "pages_blocks_text_order_idx" ON "app"."pages_blocks_text" USING btree ("_order");
  CREATE INDEX "pages_blocks_text_parent_id_idx" ON "app"."pages_blocks_text" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_text_path_idx" ON "app"."pages_blocks_text" USING btree ("_path");
  CREATE INDEX "pages_blocks_text_locale_idx" ON "app"."pages_blocks_text" USING btree ("_locale");
  CREATE INDEX "pages_blocks_image_order_idx" ON "app"."pages_blocks_image" USING btree ("_order");
  CREATE INDEX "pages_blocks_image_parent_id_idx" ON "app"."pages_blocks_image" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_image_path_idx" ON "app"."pages_blocks_image" USING btree ("_path");
  CREATE INDEX "pages_blocks_image_locale_idx" ON "app"."pages_blocks_image" USING btree ("_locale");
  CREATE INDEX "pages_blocks_image_image_idx" ON "app"."pages_blocks_image" USING btree ("image_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "app"."pages" USING btree ("slug");
  CREATE INDEX "pages_updated_at_idx" ON "app"."pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "app"."pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "app"."pages_locales" USING btree ("_status","_locale");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "app"."pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_text_order_idx" ON "app"."_pages_v_blocks_text" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_text_parent_id_idx" ON "app"."_pages_v_blocks_text" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_text_path_idx" ON "app"."_pages_v_blocks_text" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_text_locale_idx" ON "app"."_pages_v_blocks_text" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_image_order_idx" ON "app"."_pages_v_blocks_image" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_image_parent_id_idx" ON "app"."_pages_v_blocks_image" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_image_path_idx" ON "app"."_pages_v_blocks_image" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_image_locale_idx" ON "app"."_pages_v_blocks_image" USING btree ("_locale");
  CREATE INDEX "_pages_v_blocks_image_image_idx" ON "app"."_pages_v_blocks_image" USING btree ("image_id");
  CREATE INDEX "_pages_v_parent_idx" ON "app"."_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "app"."_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "app"."_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "app"."_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_created_at_idx" ON "app"."_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "app"."_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_published_locale_idx" ON "app"."_pages_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_latest_idx" ON "app"."_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "app"."_pages_v_locales" USING btree ("version__status","_locale");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "app"."_pages_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "media_updated_at_idx" ON "app"."media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "app"."media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "app"."media" USING btree ("filename");
  CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "app"."media_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_media_v_parent_idx" ON "app"."_media_v" USING btree ("parent_id");
  CREATE INDEX "_media_v_version_version_updated_at_idx" ON "app"."_media_v" USING btree ("version_updated_at");
  CREATE INDEX "_media_v_version_version_created_at_idx" ON "app"."_media_v" USING btree ("version_created_at");
  CREATE INDEX "_media_v_version_version_filename_idx" ON "app"."_media_v" USING btree ("version_filename");
  CREATE INDEX "_media_v_created_at_idx" ON "app"."_media_v" USING btree ("created_at");
  CREATE INDEX "_media_v_updated_at_idx" ON "app"."_media_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_media_v_locales_locale_parent_id_unique" ON "app"."_media_v_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "app"."payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "app"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "app"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "app"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "app"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "app"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "app"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "app"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "app"."payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "app"."payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_preferences_key_idx" ON "app"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "app"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "app"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "app"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "app"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "app"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "app"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "app"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "app"."payload_migrations" USING btree ("created_at");
  CREATE INDEX "settings_navigation_order_idx" ON "app"."settings_navigation" USING btree ("_order");
  CREATE INDEX "settings_navigation_parent_id_idx" ON "app"."settings_navigation" USING btree ("_parent_id");
  CREATE INDEX "settings_navigation_locale_idx" ON "app"."settings_navigation" USING btree ("_locale");
  CREATE INDEX "settings_navigation_page_idx" ON "app"."settings_navigation" USING btree ("page_id");
  CREATE INDEX "settings__status_idx" ON "app"."settings_locales" USING btree ("_status","_locale");
  CREATE UNIQUE INDEX "settings_locales_locale_parent_id_unique" ON "app"."settings_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_settings_v_version_navigation_order_idx" ON "app"."_settings_v_version_navigation" USING btree ("_order");
  CREATE INDEX "_settings_v_version_navigation_parent_id_idx" ON "app"."_settings_v_version_navigation" USING btree ("_parent_id");
  CREATE INDEX "_settings_v_version_navigation_locale_idx" ON "app"."_settings_v_version_navigation" USING btree ("_locale");
  CREATE INDEX "_settings_v_version_navigation_page_idx" ON "app"."_settings_v_version_navigation" USING btree ("page_id");
  CREATE INDEX "_settings_v_created_at_idx" ON "app"."_settings_v" USING btree ("created_at");
  CREATE INDEX "_settings_v_updated_at_idx" ON "app"."_settings_v" USING btree ("updated_at");
  CREATE INDEX "_settings_v_published_locale_idx" ON "app"."_settings_v" USING btree ("published_locale");
  CREATE INDEX "_settings_v_latest_idx" ON "app"."_settings_v" USING btree ("latest");
  CREATE INDEX "_settings_v_version_version__status_idx" ON "app"."_settings_v_locales" USING btree ("version__status","_locale");
  CREATE UNIQUE INDEX "_settings_v_locales_locale_parent_id_unique" ON "app"."_settings_v_locales" USING btree ("_locale","_parent_id");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "app"."users_sessions" CASCADE;
  DROP TABLE "app"."users" CASCADE;
  DROP TABLE "app"."pages_blocks_text" CASCADE;
  DROP TABLE "app"."pages_blocks_image" CASCADE;
  DROP TABLE "app"."pages" CASCADE;
  DROP TABLE "app"."pages_locales" CASCADE;
  DROP TABLE "app"."_pages_v_blocks_text" CASCADE;
  DROP TABLE "app"."_pages_v_blocks_image" CASCADE;
  DROP TABLE "app"."_pages_v" CASCADE;
  DROP TABLE "app"."_pages_v_locales" CASCADE;
  DROP TABLE "app"."media" CASCADE;
  DROP TABLE "app"."media_locales" CASCADE;
  DROP TABLE "app"."_media_v" CASCADE;
  DROP TABLE "app"."_media_v_locales" CASCADE;
  DROP TABLE "app"."payload_kv" CASCADE;
  DROP TABLE "app"."payload_locked_documents" CASCADE;
  DROP TABLE "app"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "app"."payload_preferences" CASCADE;
  DROP TABLE "app"."payload_preferences_rels" CASCADE;
  DROP TABLE "app"."payload_migrations" CASCADE;
  DROP TABLE "app"."settings_navigation" CASCADE;
  DROP TABLE "app"."settings" CASCADE;
  DROP TABLE "app"."settings_locales" CASCADE;
  DROP TABLE "app"."_settings_v_version_navigation" CASCADE;
  DROP TABLE "app"."_settings_v" CASCADE;
  DROP TABLE "app"."_settings_v_locales" CASCADE;
  DROP TYPE "app"."_locales";
  DROP TYPE "app"."enum_users_role";
  DROP TYPE "app"."enum_pages_status";
  DROP TYPE "app"."enum__pages_v_published_locale";
  DROP TYPE "app"."enum__pages_v_version_status";
  DROP TYPE "app"."enum_settings_status";
  DROP TYPE "app"."enum__settings_v_published_locale";
  DROP TYPE "app"."enum__settings_v_version_status";`);
}
