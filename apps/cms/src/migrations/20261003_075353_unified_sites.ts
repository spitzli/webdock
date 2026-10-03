import { MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('en', 'de');
  CREATE TYPE "public"."enum_users_tenants_role" AS ENUM('tenant-admin', 'editor', 'reader');
  CREATE TYPE "public"."enum__users_v_version_tenants_role" AS ENUM('tenant-admin', 'editor', 'reader');
  CREATE TYPE "public"."enum_sites_modules" AS ENUM('pages', 'projects', 'media', 'faqs', 'site-settings', 'forms', 'redirects');
  CREATE TYPE "public"."enum_sites_locales" AS ENUM('en', 'de');
  CREATE TYPE "public"."enum_sites_model" AS ENUM('landing', 'portfolio', 'business');
  CREATE TYPE "public"."enum_sites_default_locale" AS ENUM('en', 'de');
  CREATE TYPE "public"."enum__sites_v_version_modules" AS ENUM('pages', 'projects', 'media', 'faqs', 'site-settings', 'forms', 'redirects');
  CREATE TYPE "public"."enum__sites_v_version_locales" AS ENUM('en', 'de');
  CREATE TYPE "public"."enum__sites_v_version_model" AS ENUM('landing', 'portfolio', 'business');
  CREATE TYPE "public"."enum__sites_v_version_default_locale" AS ENUM('en', 'de');
  CREATE TYPE "public"."enum_integrations_scopes" AS ENUM('content:read', 'forms:submit');
  CREATE TYPE "public"."enum_projects_category" AS ENUM('Webentwicklung', 'Webapps', 'APIs & Plattformen', 'Cloud & Infrastruktur', 'Developer Experience', 'Open Source');
  CREATE TYPE "public"."enum_projects_project_status" AS ENUM('unspecified', 'development', 'live', 'completed', 'archived');
  CREATE TYPE "public"."enum_projects_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__projects_v_version_category" AS ENUM('Webentwicklung', 'Webapps', 'APIs & Plattformen', 'Cloud & Infrastruktur', 'Developer Experience', 'Open Source');
  CREATE TYPE "public"."enum__projects_v_version_project_status" AS ENUM('unspecified', 'development', 'live', 'completed', 'archived');
  CREATE TYPE "public"."enum__projects_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "public"."enum__projects_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_stall_pages_hero_links_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_stall_pages_hero_links_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum_stall_pages_blocks_content_columns_size" AS ENUM('oneThird', 'half', 'twoThirds', 'full');
  CREATE TYPE "public"."enum_stall_pages_blocks_content_columns_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_stall_pages_blocks_content_columns_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum_stall_pages_blocks_cta_links_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_stall_pages_blocks_cta_links_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum_stall_pages_hero_type" AS ENUM('image', 'text', 'none');
  CREATE TYPE "public"."enum_stall_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__stall_pages_v_version_hero_links_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__stall_pages_v_version_hero_links_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum__stall_pages_v_blocks_content_columns_size" AS ENUM('oneThird', 'half', 'twoThirds', 'full');
  CREATE TYPE "public"."enum__stall_pages_v_blocks_content_columns_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__stall_pages_v_blocks_content_columns_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum__stall_pages_v_blocks_cta_links_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__stall_pages_v_blocks_cta_links_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum__stall_pages_v_version_hero_type" AS ENUM('image', 'text', 'none');
  CREATE TYPE "public"."enum__stall_pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__stall_pages_v_published_locale" AS ENUM('en', 'de');
  CREATE TYPE "public"."enum_stall_settings_hours_days" AS ENUM('mo', 'tu', 'we', 'th', 'fr', 'sa', 'su');
  CREATE TYPE "public"."enum__stall_settings_v_version_hours_days" AS ENUM('mo', 'tu', 'we', 'th', 'fr', 'sa', 'su');
  CREATE TYPE "public"."enum_stall_header_nav_items_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__stall_header_v_version_nav_items_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_stall_footer_nav_items_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__stall_footer_v_version_nav_items_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_stall_redirects_to_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__stall_redirects_v_version_to_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_stall_forms_confirmation_type" AS ENUM('message', 'redirect');
  CREATE TYPE "public"."enum__stall_forms_v_version_confirmation_type" AS ENUM('message', 'redirect');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_log_parent_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  CREATE TABLE "sites_modules" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum_sites_modules",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "sites_locales" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum_sites_locales",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "sites" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "name" varchar NOT NULL,
    "key" varchar NOT NULL,
    "url" varchar NOT NULL,
    "model" "enum_sites_model" DEFAULT 'landing' NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "default_locale" "enum_sites_default_locale" DEFAULT 'en' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_sites_v_version_modules" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum__sites_v_version_modules",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "_sites_v_version_locales" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum__sites_v_version_locales",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "_sites_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_tenant_id" integer,
    "version_name" varchar NOT NULL,
    "version_key" varchar NOT NULL,
    "version_url" varchar NOT NULL,
    "version_model" "enum__sites_v_version_model" DEFAULT 'landing' NOT NULL,
    "version_active" boolean DEFAULT true NOT NULL,
    "version_default_locale" "enum__sites_v_version_default_locale" DEFAULT 'en' NOT NULL,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "integrations_scopes" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum_integrations_scopes",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "integrations" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "site_id" integer NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "api_key" varchar,
    "api_key_last4" varchar,
    "api_key_index" varchar
  );

  CREATE TABLE "clients" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "source_i_d" varchar,
    "site_id" integer NOT NULL,
    "name" varchar NOT NULL,
    "website" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "projects_technologies" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar
  );

  CREATE TABLE "projects_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "url" varchar
  );

  CREATE TABLE "projects_links_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "projects" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "source_i_d" varchar,
    "site_id" integer,
    "name" varchar,
    "slug" varchar,
    "client_id" integer,
    "image_id" integer,
    "category" "enum_projects_category",
    "website" varchar,
    "repository" varchar,
    "period" varchar,
    "project_status" "enum_projects_project_status" DEFAULT 'unspecified',
    "featured" boolean DEFAULT false,
    "sort_order" numeric DEFAULT 10,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "projects_locales" (
    "summary" varchar,
    "description" varchar,
    "_status" "enum_projects_status" DEFAULT 'draft',
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_projects_v_version_technologies" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_projects_v_version_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "url" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_projects_v_version_links_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_projects_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_tenant_id" integer,
    "version_source_i_d" varchar,
    "version_site_id" integer,
    "version_name" varchar,
    "version_slug" varchar,
    "version_client_id" integer,
    "version_image_id" integer,
    "version_category" "enum__projects_v_version_category",
    "version_website" varchar,
    "version_repository" varchar,
    "version_period" varchar,
    "version_project_status" "enum__projects_v_version_project_status" DEFAULT 'unspecified',
    "version_featured" boolean DEFAULT false,
    "version_sort_order" numeric DEFAULT 10,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "published_locale" "enum__projects_v_published_locale",
    "latest" boolean
  );

  CREATE TABLE "_projects_v_locales" (
    "version_summary" varchar,
    "version_description" varchar,
    "version__status" "enum__projects_v_version_status" DEFAULT 'draft',
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "website_settings" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "source_i_d" varchar,
    "site_id" integer NOT NULL,
    "name" varchar DEFAULT 'Spitzli Development' NOT NULL,
    "owner" varchar DEFAULT 'Dominik Spitzli' NOT NULL,
    "email" varchar DEFAULT 'info@spitzli.dev' NOT NULL,
    "street" varchar NOT NULL,
    "postcode" varchar NOT NULL,
    "city" varchar NOT NULL,
    "country" varchar DEFAULT 'Deutschland' NOT NULL,
    "phone" varchar,
    "vat_i_d" varchar,
    "business_i_d" varchar,
    "register" varchar,
    "database_provider" varchar,
    "database_region" varchar,
    "log_retention" varchar,
    "mail_provider" varchar,
    "transfers" varchar,
    "legal_reviewed" boolean DEFAULT false,
    "privacy_reviewed" boolean DEFAULT false,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "media" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "source_i_d" varchar,
    "site_id" integer NOT NULL,
    "caption" jsonb,
    "rights_confirmed" boolean,
    "prefix" varchar DEFAULT 'cms',
    "_objectkey" varchar,
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
    "focal_y" numeric,
    "sizes_thumbnail_url" varchar,
    "sizes_thumbnail_width" numeric,
    "sizes_thumbnail_height" numeric,
    "sizes_thumbnail_mime_type" varchar,
    "sizes_thumbnail_filesize" numeric,
    "sizes_thumbnail_filename" varchar,
    "sizes_square_url" varchar,
    "sizes_square_width" numeric,
    "sizes_square_height" numeric,
    "sizes_square_mime_type" varchar,
    "sizes_square_filesize" numeric,
    "sizes_square_filename" varchar,
    "sizes_small_url" varchar,
    "sizes_small_width" numeric,
    "sizes_small_height" numeric,
    "sizes_small_mime_type" varchar,
    "sizes_small_filesize" numeric,
    "sizes_small_filename" varchar,
    "sizes_medium_url" varchar,
    "sizes_medium_width" numeric,
    "sizes_medium_height" numeric,
    "sizes_medium_mime_type" varchar,
    "sizes_medium_filesize" numeric,
    "sizes_medium_filename" varchar,
    "sizes_large_url" varchar,
    "sizes_large_width" numeric,
    "sizes_large_height" numeric,
    "sizes_large_mime_type" varchar,
    "sizes_large_filesize" numeric,
    "sizes_large_filename" varchar,
    "sizes_xlarge_url" varchar,
    "sizes_xlarge_width" numeric,
    "sizes_xlarge_height" numeric,
    "sizes_xlarge_mime_type" varchar,
    "sizes_xlarge_filesize" numeric,
    "sizes_xlarge_filename" varchar,
    "sizes_og_url" varchar,
    "sizes_og_width" numeric,
    "sizes_og_height" numeric,
    "sizes_og_mime_type" varchar,
    "sizes_og_filesize" numeric,
    "sizes_og_filename" varchar,
    "sizes_card_url" varchar,
    "sizes_card_width" numeric,
    "sizes_card_height" numeric,
    "sizes_card_mime_type" varchar,
    "sizes_card_filesize" numeric,
    "sizes_card_filename" varchar
  );

  CREATE TABLE "media_locales" (
    "alt" varchar NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "stall_pages_hero_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "link_type" "enum_stall_pages_hero_links_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum_stall_pages_hero_links_link_appearance" DEFAULT 'default'
  );

  CREATE TABLE "stall_pages_blocks_services_items" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "title" varchar,
    "text" varchar,
    "price" varchar
  );

  CREATE TABLE "stall_pages_blocks_services" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "heading" varchar,
    "intro" varchar,
    "block_name" varchar
  );

  CREATE TABLE "stall_pages_blocks_facilities_items" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "label" varchar,
    "value" varchar
  );

  CREATE TABLE "stall_pages_blocks_facilities" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "heading" varchar,
    "intro" varchar,
    "block_name" varchar
  );

  CREATE TABLE "stall_pages_blocks_content_columns" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "size" "enum_stall_pages_blocks_content_columns_size" DEFAULT 'half',
    "rich_text" jsonb,
    "enable_link" boolean,
    "link_type" "enum_stall_pages_blocks_content_columns_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum_stall_pages_blocks_content_columns_link_appearance" DEFAULT 'default'
  );

  CREATE TABLE "stall_pages_blocks_content" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "block_name" varchar
  );

  CREATE TABLE "stall_pages_blocks_media_block" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "media_id" integer,
    "block_name" varchar
  );

  CREATE TABLE "stall_pages_blocks_gallery" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "heading" varchar,
    "block_name" varchar
  );

  CREATE TABLE "stall_pages_blocks_team_members" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "photo_id" integer,
    "name" varchar,
    "role" varchar,
    "text" varchar
  );

  CREATE TABLE "stall_pages_blocks_team" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "heading" varchar,
    "intro" varchar,
    "block_name" varchar
  );

  CREATE TABLE "stall_pages_blocks_contact" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "heading" varchar DEFAULT 'Kontakt',
    "text" varchar,
    "block_name" varchar
  );

  CREATE TABLE "stall_pages_blocks_cta_links" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "link_type" "enum_stall_pages_blocks_cta_links_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum_stall_pages_blocks_cta_links_link_appearance" DEFAULT 'default'
  );

  CREATE TABLE "stall_pages_blocks_cta" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "heading" varchar,
    "text" varchar,
    "block_name" varchar
  );

  CREATE TABLE "stall_pages_blocks_form_block" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "form_id" integer,
    "heading" varchar,
    "intro" varchar,
    "block_name" varchar
  );

  CREATE TABLE "stall_pages" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "source_i_d" varchar,
    "site_id" integer,
    "title" varchar,
    "slug" varchar,
    "hero_type" "enum_stall_pages_hero_type" DEFAULT 'text',
    "hero_title" varchar,
    "hero_text" varchar,
    "hero_media_id" integer,
    "meta_title" varchar,
    "meta_description" varchar,
    "meta_image_id" integer,
    "published_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_stall_pages_status" DEFAULT 'draft'
  );

  CREATE TABLE "stall_pages_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "stall_pages_id" integer,
    "media_id" integer
  );

  CREATE TABLE "_stall_pages_v_version_hero_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "link_type" "enum__stall_pages_v_version_hero_links_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum__stall_pages_v_version_hero_links_link_appearance" DEFAULT 'default',
    "_uuid" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_services_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar,
    "text" varchar,
    "price" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_services" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "heading" varchar,
    "intro" varchar,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_facilities_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "label" varchar,
    "value" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_facilities" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "heading" varchar,
    "intro" varchar,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_content_columns" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "size" "enum__stall_pages_v_blocks_content_columns_size" DEFAULT 'half',
    "rich_text" jsonb,
    "enable_link" boolean,
    "link_type" "enum__stall_pages_v_blocks_content_columns_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum__stall_pages_v_blocks_content_columns_link_appearance" DEFAULT 'default',
    "_uuid" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_content" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_media_block" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "media_id" integer,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_gallery" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "heading" varchar,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_team_members" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "photo_id" integer,
    "name" varchar,
    "role" varchar,
    "text" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_team" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "heading" varchar,
    "intro" varchar,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_contact" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "heading" varchar DEFAULT 'Kontakt',
    "text" varchar,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_cta_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "link_type" "enum__stall_pages_v_blocks_cta_links_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum__stall_pages_v_blocks_cta_links_link_appearance" DEFAULT 'default',
    "_uuid" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_cta" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "heading" varchar,
    "text" varchar,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_pages_v_blocks_form_block" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "form_id" integer,
    "heading" varchar,
    "intro" varchar,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_pages_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_tenant_id" integer,
    "version_source_i_d" varchar,
    "version_site_id" integer,
    "version_title" varchar,
    "version_slug" varchar,
    "version_hero_type" "enum__stall_pages_v_version_hero_type" DEFAULT 'text',
    "version_hero_title" varchar,
    "version_hero_text" varchar,
    "version_hero_media_id" integer,
    "version_meta_title" varchar,
    "version_meta_description" varchar,
    "version_meta_image_id" integer,
    "version_published_at" timestamp(3) with time zone,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__stall_pages_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "published_locale" "enum__stall_pages_v_published_locale",
    "latest" boolean,
    "autosave" boolean
  );

  CREATE TABLE "_stall_pages_v_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "stall_pages_id" integer,
    "media_id" integer
  );

  CREATE TABLE "stall_settings_hours_days" (
    "order" integer NOT NULL,
    "parent_id" varchar NOT NULL,
    "value" "enum_stall_settings_hours_days",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "stall_settings_hours" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "open" timestamp(3) with time zone NOT NULL,
    "close" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "stall_settings" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "source_i_d" varchar,
    "site_id" integer NOT NULL,
    "name" varchar DEFAULT 'Stall Eichenbruch' NOT NULL,
    "tagline" varchar,
    "street" varchar,
    "city" varchar,
    "phone" varchar,
    "mobile" varchar,
    "email" varchar,
    "maps_url" varchar,
    "description" varchar,
    "maintenance_enabled" boolean DEFAULT false,
    "maintenance_title" varchar DEFAULT 'Wir sind gleich wieder da.',
    "maintenance_text" varchar DEFAULT 'Die Website wird gerade überarbeitet. Sie erreichen uns wie gewohnt per Telefon oder E-Mail.',
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_stall_settings_v_version_hours_days" (
    "order" integer NOT NULL,
    "parent_id" integer NOT NULL,
    "value" "enum__stall_settings_v_version_hours_days",
    "id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "_stall_settings_v_version_hours" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "open" timestamp(3) with time zone NOT NULL,
    "close" timestamp(3) with time zone NOT NULL,
    "_uuid" varchar
  );

  CREATE TABLE "_stall_settings_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_tenant_id" integer,
    "version_source_i_d" varchar,
    "version_site_id" integer NOT NULL,
    "version_name" varchar DEFAULT 'Stall Eichenbruch' NOT NULL,
    "version_tagline" varchar,
    "version_street" varchar,
    "version_city" varchar,
    "version_phone" varchar,
    "version_mobile" varchar,
    "version_email" varchar,
    "version_maps_url" varchar,
    "version_description" varchar,
    "version_maintenance_enabled" boolean DEFAULT false,
    "version_maintenance_title" varchar DEFAULT 'Wir sind gleich wieder da.',
    "version_maintenance_text" varchar DEFAULT 'Die Website wird gerade überarbeitet. Sie erreichen uns wie gewohnt per Telefon oder E-Mail.',
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "stall_header_nav_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "link_type" "enum_stall_header_nav_items_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar NOT NULL
  );

  CREATE TABLE "stall_header" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "source_i_d" varchar,
    "site_id" integer NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "stall_header_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "stall_pages_id" integer
  );

  CREATE TABLE "_stall_header_v_version_nav_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "link_type" "enum__stall_header_v_version_nav_items_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar NOT NULL,
    "_uuid" varchar
  );

  CREATE TABLE "_stall_header_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_tenant_id" integer,
    "version_source_i_d" varchar,
    "version_site_id" integer NOT NULL,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_stall_header_v_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "stall_pages_id" integer
  );

  CREATE TABLE "stall_footer_nav_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "link_type" "enum_stall_footer_nav_items_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar NOT NULL
  );

  CREATE TABLE "stall_footer" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "source_i_d" varchar,
    "site_id" integer NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "stall_footer_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "stall_pages_id" integer
  );

  CREATE TABLE "_stall_footer_v_version_nav_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "link_type" "enum__stall_footer_v_version_nav_items_link_type" DEFAULT 'reference',
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar NOT NULL,
    "_uuid" varchar
  );

  CREATE TABLE "_stall_footer_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_tenant_id" integer,
    "version_source_i_d" varchar,
    "version_site_id" integer NOT NULL,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_stall_footer_v_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "stall_pages_id" integer
  );

  CREATE TABLE "stall_redirects" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "source_i_d" varchar,
    "site_id" integer NOT NULL,
    "from" varchar NOT NULL,
    "to_type" "enum_stall_redirects_to_type" DEFAULT 'custom',
    "to_url" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "stall_redirects_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "stall_pages_id" integer
  );

  CREATE TABLE "_stall_redirects_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_tenant_id" integer,
    "version_source_i_d" varchar,
    "version_site_id" integer NOT NULL,
    "version_from" varchar NOT NULL,
    "version_to_type" "enum__stall_redirects_v_version_to_type" DEFAULT 'custom',
    "version_to_url" varchar,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_stall_redirects_v_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "stall_pages_id" integer
  );

  CREATE TABLE "stall_forms_blocks_checkbox" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "default_value" boolean,
    "block_name" varchar
  );

  CREATE TABLE "stall_forms_blocks_checkbox_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "stall_forms_blocks_country" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "block_name" varchar
  );

  CREATE TABLE "stall_forms_blocks_country_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "stall_forms_blocks_email" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "block_name" varchar
  );

  CREATE TABLE "stall_forms_blocks_email_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "stall_forms_blocks_message" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "block_name" varchar
  );

  CREATE TABLE "stall_forms_blocks_message_locales" (
    "message" jsonb,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "stall_forms_blocks_number" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "default_value" numeric,
    "required" boolean,
    "block_name" varchar
  );

  CREATE TABLE "stall_forms_blocks_number_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "stall_forms_blocks_select_options" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "value" varchar NOT NULL
  );

  CREATE TABLE "stall_forms_blocks_select_options_locales" (
    "label" varchar NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "stall_forms_blocks_select" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "placeholder" varchar,
    "required" boolean,
    "block_name" varchar
  );

  CREATE TABLE "stall_forms_blocks_select_locales" (
    "label" varchar,
    "default_value" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "stall_forms_blocks_state" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "block_name" varchar
  );

  CREATE TABLE "stall_forms_blocks_state_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "stall_forms_blocks_text" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "block_name" varchar
  );

  CREATE TABLE "stall_forms_blocks_text_locales" (
    "label" varchar,
    "default_value" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "stall_forms_blocks_textarea" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "block_name" varchar
  );

  CREATE TABLE "stall_forms_blocks_textarea_locales" (
    "label" varchar,
    "default_value" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "stall_forms_emails" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "email_to" varchar,
    "cc" varchar,
    "bcc" varchar,
    "reply_to" varchar,
    "email_from" varchar
  );

  CREATE TABLE "stall_forms_emails_locales" (
    "subject" varchar DEFAULT 'You''ve received a new message.' NOT NULL,
    "message" jsonb,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" varchar NOT NULL
  );

  CREATE TABLE "stall_forms" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "source_i_d" varchar,
    "site_id" integer NOT NULL,
    "title" varchar NOT NULL,
    "confirmation_type" "enum_stall_forms_confirmation_type" DEFAULT 'message',
    "redirect_url" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "stall_forms_locales" (
    "submit_button_label" varchar,
    "confirmation_message" jsonb,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v_blocks_checkbox" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "default_value" boolean,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_forms_v_blocks_checkbox_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v_blocks_country" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_forms_v_blocks_country_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v_blocks_email" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_forms_v_blocks_email_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v_blocks_message" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_forms_v_blocks_message_locales" (
    "message" jsonb,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v_blocks_number" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "default_value" numeric,
    "required" boolean,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_forms_v_blocks_number_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v_blocks_select_options" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "value" varchar NOT NULL,
    "_uuid" varchar
  );

  CREATE TABLE "_stall_forms_v_blocks_select_options_locales" (
    "label" varchar NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v_blocks_select" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "placeholder" varchar,
    "required" boolean,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_forms_v_blocks_select_locales" (
    "label" varchar,
    "default_value" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v_blocks_state" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_forms_v_blocks_state_locales" (
    "label" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v_blocks_text" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_forms_v_blocks_text_locales" (
    "label" varchar,
    "default_value" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v_blocks_textarea" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar NOT NULL,
    "width" numeric,
    "required" boolean,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_stall_forms_v_blocks_textarea_locales" (
    "label" varchar,
    "default_value" varchar,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v_version_emails" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "email_to" varchar,
    "cc" varchar,
    "bcc" varchar,
    "reply_to" varchar,
    "email_from" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_stall_forms_v_version_emails_locales" (
    "subject" varchar DEFAULT 'You''ve received a new message.' NOT NULL,
    "message" jsonb,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "_stall_forms_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_tenant_id" integer,
    "version_source_i_d" varchar,
    "version_site_id" integer NOT NULL,
    "version_title" varchar NOT NULL,
    "version_confirmation_type" "enum__stall_forms_v_version_confirmation_type" DEFAULT 'message',
    "version_redirect_url" varchar,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_stall_forms_v_locales" (
    "version_submit_button_label" varchar,
    "version_confirmation_message" jsonb,
    "id" serial PRIMARY KEY NOT NULL,
    "_locale" "_locales" NOT NULL,
    "_parent_id" integer NOT NULL
  );

  CREATE TABLE "stall_form_submissions_submission_data" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "field" varchar NOT NULL,
    "value" varchar NOT NULL
  );

  CREATE TABLE "stall_form_submissions" (
    "id" serial PRIMARY KEY NOT NULL,
    "tenant_id" integer,
    "source_i_d" varchar,
    "site_id" integer NOT NULL,
    "form_id" integer NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "_stall_form_submissions_v_version_submission_data" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "field" varchar NOT NULL,
    "value" varchar NOT NULL,
    "_uuid" varchar
  );

  CREATE TABLE "_stall_form_submissions_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_tenant_id" integer,
    "version_source_i_d" varchar,
    "version_site_id" integer NOT NULL,
    "version_form_id" integer NOT NULL,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_jobs_log" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "executed_at" timestamp(3) with time zone NOT NULL,
    "completed_at" timestamp(3) with time zone NOT NULL,
    "task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
    "task_i_d" varchar NOT NULL,
    "input" jsonb NOT NULL,
    "output" jsonb,
    "state" "enum_payload_jobs_log_state" NOT NULL,
    "error" jsonb,
    "parent_task_slug" "enum_payload_jobs_log_parent_task_slug",
    "parent_task_i_d" varchar
  );

  CREATE TABLE "payload_jobs" (
    "id" serial PRIMARY KEY NOT NULL,
    "input" jsonb,
    "meta" jsonb,
    "completed_at" timestamp(3) with time zone,
    "total_tried" numeric DEFAULT 0,
    "has_error" boolean DEFAULT false,
    "error" jsonb,
    "task_slug" "enum_payload_jobs_task_slug",
    "queue" varchar DEFAULT 'default',
    "wait_until" timestamp(3) with time zone,
    "processing_until" timestamp(3) with time zone,
    "processing_token" varchar,
    "concurrency_key" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_jobs_stats" (
    "id" serial PRIMARY KEY NOT NULL,
    "stats" jsonb,
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  DROP INDEX "landing_pages_tenant_idx";
  ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'member';
  ALTER TABLE "_users_v" ALTER COLUMN "version_role" SET DEFAULT 'member';
  ALTER TABLE "users_tenants" ADD COLUMN "role" "enum_users_tenants_role" DEFAULT 'editor' NOT NULL;
  ALTER TABLE "_users_v_version_tenants" ADD COLUMN "role" "enum__users_v_version_tenants_role" DEFAULT 'editor' NOT NULL;
  ALTER TABLE "landing_pages" ADD COLUMN "source_i_d" varchar;
  ALTER TABLE "landing_pages" ADD COLUMN "site_id" integer;
  ALTER TABLE "_landing_pages_v" ADD COLUMN "version_source_i_d" varchar;
  ALTER TABLE "_landing_pages_v" ADD COLUMN "version_site_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sites_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "integrations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "clients_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "projects_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "website_settings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "stall_pages_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "stall_settings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "stall_header_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "stall_footer_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "stall_redirects_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "stall_forms_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "stall_form_submissions_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "integrations_id" integer;
  ALTER TABLE "sites_modules" ADD CONSTRAINT "sites_modules_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites_locales" ADD CONSTRAINT "sites_locales_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_sites_v_version_modules" ADD CONSTRAINT "_sites_v_version_modules_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_sites_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_sites_v_version_locales" ADD CONSTRAINT "_sites_v_version_locales_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_sites_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_sites_v" ADD CONSTRAINT "_sites_v_parent_id_sites_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_sites_v" ADD CONSTRAINT "_sites_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "integrations_scopes" ADD CONSTRAINT "integrations_scopes_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "integrations" ADD CONSTRAINT "integrations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "clients" ADD CONSTRAINT "clients_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "projects_technologies" ADD CONSTRAINT "projects_technologies_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projects_links" ADD CONSTRAINT "projects_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projects_links_locales" ADD CONSTRAINT "projects_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."projects_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "projects" ADD CONSTRAINT "projects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "projects" ADD CONSTRAINT "projects_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "projects_locales" ADD CONSTRAINT "projects_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_projects_v_version_technologies" ADD CONSTRAINT "_projects_v_version_technologies_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_projects_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_projects_v_version_links" ADD CONSTRAINT "_projects_v_version_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_projects_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_projects_v_version_links_locales" ADD CONSTRAINT "_projects_v_version_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_projects_v_version_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_projects_v" ADD CONSTRAINT "_projects_v_parent_id_projects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_projects_v" ADD CONSTRAINT "_projects_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_projects_v" ADD CONSTRAINT "_projects_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_projects_v" ADD CONSTRAINT "_projects_v_version_client_id_clients_id_fk" FOREIGN KEY ("version_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_projects_v" ADD CONSTRAINT "_projects_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_projects_v_locales" ADD CONSTRAINT "_projects_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_projects_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "website_settings" ADD CONSTRAINT "website_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "website_settings" ADD CONSTRAINT "website_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_hero_links" ADD CONSTRAINT "stall_pages_hero_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_services_items" ADD CONSTRAINT "stall_pages_blocks_services_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages_blocks_services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_services" ADD CONSTRAINT "stall_pages_blocks_services_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_facilities_items" ADD CONSTRAINT "stall_pages_blocks_facilities_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages_blocks_facilities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_facilities" ADD CONSTRAINT "stall_pages_blocks_facilities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_content_columns" ADD CONSTRAINT "stall_pages_blocks_content_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_content" ADD CONSTRAINT "stall_pages_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_media_block" ADD CONSTRAINT "stall_pages_blocks_media_block_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_media_block" ADD CONSTRAINT "stall_pages_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_gallery" ADD CONSTRAINT "stall_pages_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_team_members" ADD CONSTRAINT "stall_pages_blocks_team_members_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_team_members" ADD CONSTRAINT "stall_pages_blocks_team_members_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages_blocks_team"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_team" ADD CONSTRAINT "stall_pages_blocks_team_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_contact" ADD CONSTRAINT "stall_pages_blocks_contact_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_cta_links" ADD CONSTRAINT "stall_pages_blocks_cta_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_cta" ADD CONSTRAINT "stall_pages_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_form_block" ADD CONSTRAINT "stall_pages_blocks_form_block_form_id_stall_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."stall_forms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_pages_blocks_form_block" ADD CONSTRAINT "stall_pages_blocks_form_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages" ADD CONSTRAINT "stall_pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_pages" ADD CONSTRAINT "stall_pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_pages" ADD CONSTRAINT "stall_pages_hero_media_id_media_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_pages" ADD CONSTRAINT "stall_pages_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_pages_rels" ADD CONSTRAINT "stall_pages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_rels" ADD CONSTRAINT "stall_pages_rels_stall_pages_fk" FOREIGN KEY ("stall_pages_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_pages_rels" ADD CONSTRAINT "stall_pages_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_version_hero_links" ADD CONSTRAINT "_stall_pages_v_version_hero_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_services_items" ADD CONSTRAINT "_stall_pages_v_blocks_services_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v_blocks_services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_services" ADD CONSTRAINT "_stall_pages_v_blocks_services_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_facilities_items" ADD CONSTRAINT "_stall_pages_v_blocks_facilities_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v_blocks_facilities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_facilities" ADD CONSTRAINT "_stall_pages_v_blocks_facilities_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_content_columns" ADD CONSTRAINT "_stall_pages_v_blocks_content_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_content" ADD CONSTRAINT "_stall_pages_v_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_media_block" ADD CONSTRAINT "_stall_pages_v_blocks_media_block_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_media_block" ADD CONSTRAINT "_stall_pages_v_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_gallery" ADD CONSTRAINT "_stall_pages_v_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_team_members" ADD CONSTRAINT "_stall_pages_v_blocks_team_members_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_team_members" ADD CONSTRAINT "_stall_pages_v_blocks_team_members_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v_blocks_team"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_team" ADD CONSTRAINT "_stall_pages_v_blocks_team_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_contact" ADD CONSTRAINT "_stall_pages_v_blocks_contact_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_cta_links" ADD CONSTRAINT "_stall_pages_v_blocks_cta_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_cta" ADD CONSTRAINT "_stall_pages_v_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_form_block" ADD CONSTRAINT "_stall_pages_v_blocks_form_block_form_id_stall_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."stall_forms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_blocks_form_block" ADD CONSTRAINT "_stall_pages_v_blocks_form_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v" ADD CONSTRAINT "_stall_pages_v_parent_id_stall_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_pages_v" ADD CONSTRAINT "_stall_pages_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_pages_v" ADD CONSTRAINT "_stall_pages_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_pages_v" ADD CONSTRAINT "_stall_pages_v_version_hero_media_id_media_id_fk" FOREIGN KEY ("version_hero_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_pages_v" ADD CONSTRAINT "_stall_pages_v_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_rels" ADD CONSTRAINT "_stall_pages_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_stall_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_rels" ADD CONSTRAINT "_stall_pages_v_rels_stall_pages_fk" FOREIGN KEY ("stall_pages_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_pages_v_rels" ADD CONSTRAINT "_stall_pages_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_settings_hours_days" ADD CONSTRAINT "stall_settings_hours_days_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_settings_hours"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_settings_hours" ADD CONSTRAINT "stall_settings_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_settings" ADD CONSTRAINT "stall_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_settings" ADD CONSTRAINT "stall_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_settings_v_version_hours_days" ADD CONSTRAINT "_stall_settings_v_version_hours_days_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_stall_settings_v_version_hours"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_settings_v_version_hours" ADD CONSTRAINT "_stall_settings_v_version_hours_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_settings_v" ADD CONSTRAINT "_stall_settings_v_parent_id_stall_settings_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_settings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_settings_v" ADD CONSTRAINT "_stall_settings_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_settings_v" ADD CONSTRAINT "_stall_settings_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_header_nav_items" ADD CONSTRAINT "stall_header_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_header" ADD CONSTRAINT "stall_header_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_header" ADD CONSTRAINT "stall_header_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_header_rels" ADD CONSTRAINT "stall_header_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_header_rels" ADD CONSTRAINT "stall_header_rels_stall_pages_fk" FOREIGN KEY ("stall_pages_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_header_v_version_nav_items" ADD CONSTRAINT "_stall_header_v_version_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_header_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_header_v" ADD CONSTRAINT "_stall_header_v_parent_id_stall_header_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_header"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_header_v" ADD CONSTRAINT "_stall_header_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_header_v" ADD CONSTRAINT "_stall_header_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_header_v_rels" ADD CONSTRAINT "_stall_header_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_stall_header_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_header_v_rels" ADD CONSTRAINT "_stall_header_v_rels_stall_pages_fk" FOREIGN KEY ("stall_pages_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_footer_nav_items" ADD CONSTRAINT "stall_footer_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_footer" ADD CONSTRAINT "stall_footer_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_footer" ADD CONSTRAINT "stall_footer_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_footer_rels" ADD CONSTRAINT "stall_footer_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_footer_rels" ADD CONSTRAINT "stall_footer_rels_stall_pages_fk" FOREIGN KEY ("stall_pages_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_footer_v_version_nav_items" ADD CONSTRAINT "_stall_footer_v_version_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_footer_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_footer_v" ADD CONSTRAINT "_stall_footer_v_parent_id_stall_footer_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_footer"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_footer_v" ADD CONSTRAINT "_stall_footer_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_footer_v" ADD CONSTRAINT "_stall_footer_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_footer_v_rels" ADD CONSTRAINT "_stall_footer_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_stall_footer_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_footer_v_rels" ADD CONSTRAINT "_stall_footer_v_rels_stall_pages_fk" FOREIGN KEY ("stall_pages_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_redirects" ADD CONSTRAINT "stall_redirects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_redirects" ADD CONSTRAINT "stall_redirects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_redirects_rels" ADD CONSTRAINT "stall_redirects_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_redirects_rels" ADD CONSTRAINT "stall_redirects_rels_stall_pages_fk" FOREIGN KEY ("stall_pages_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_redirects_v" ADD CONSTRAINT "_stall_redirects_v_parent_id_stall_redirects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_redirects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_redirects_v" ADD CONSTRAINT "_stall_redirects_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_redirects_v" ADD CONSTRAINT "_stall_redirects_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_redirects_v_rels" ADD CONSTRAINT "_stall_redirects_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_stall_redirects_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_redirects_v_rels" ADD CONSTRAINT "_stall_redirects_v_rels_stall_pages_fk" FOREIGN KEY ("stall_pages_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_checkbox" ADD CONSTRAINT "stall_forms_blocks_checkbox_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_checkbox_locales" ADD CONSTRAINT "stall_forms_blocks_checkbox_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_blocks_checkbox"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_country" ADD CONSTRAINT "stall_forms_blocks_country_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_country_locales" ADD CONSTRAINT "stall_forms_blocks_country_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_blocks_country"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_email" ADD CONSTRAINT "stall_forms_blocks_email_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_email_locales" ADD CONSTRAINT "stall_forms_blocks_email_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_blocks_email"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_message" ADD CONSTRAINT "stall_forms_blocks_message_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_message_locales" ADD CONSTRAINT "stall_forms_blocks_message_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_blocks_message"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_number" ADD CONSTRAINT "stall_forms_blocks_number_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_number_locales" ADD CONSTRAINT "stall_forms_blocks_number_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_blocks_number"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_select_options" ADD CONSTRAINT "stall_forms_blocks_select_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_blocks_select"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_select_options_locales" ADD CONSTRAINT "stall_forms_blocks_select_options_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_blocks_select_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_select" ADD CONSTRAINT "stall_forms_blocks_select_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_select_locales" ADD CONSTRAINT "stall_forms_blocks_select_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_blocks_select"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_state" ADD CONSTRAINT "stall_forms_blocks_state_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_state_locales" ADD CONSTRAINT "stall_forms_blocks_state_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_blocks_state"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_text" ADD CONSTRAINT "stall_forms_blocks_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_text_locales" ADD CONSTRAINT "stall_forms_blocks_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_blocks_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_textarea" ADD CONSTRAINT "stall_forms_blocks_textarea_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_blocks_textarea_locales" ADD CONSTRAINT "stall_forms_blocks_textarea_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_blocks_textarea"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_emails" ADD CONSTRAINT "stall_forms_emails_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms_emails_locales" ADD CONSTRAINT "stall_forms_emails_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms_emails"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_forms" ADD CONSTRAINT "stall_forms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_forms" ADD CONSTRAINT "stall_forms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_forms_locales" ADD CONSTRAINT "stall_forms_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_checkbox" ADD CONSTRAINT "_stall_forms_v_blocks_checkbox_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_checkbox_locales" ADD CONSTRAINT "_stall_forms_v_blocks_checkbox_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_blocks_checkbox"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_country" ADD CONSTRAINT "_stall_forms_v_blocks_country_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_country_locales" ADD CONSTRAINT "_stall_forms_v_blocks_country_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_blocks_country"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_email" ADD CONSTRAINT "_stall_forms_v_blocks_email_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_email_locales" ADD CONSTRAINT "_stall_forms_v_blocks_email_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_blocks_email"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_message" ADD CONSTRAINT "_stall_forms_v_blocks_message_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_message_locales" ADD CONSTRAINT "_stall_forms_v_blocks_message_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_blocks_message"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_number" ADD CONSTRAINT "_stall_forms_v_blocks_number_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_number_locales" ADD CONSTRAINT "_stall_forms_v_blocks_number_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_blocks_number"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_select_options" ADD CONSTRAINT "_stall_forms_v_blocks_select_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_blocks_select"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_select_options_locales" ADD CONSTRAINT "_stall_forms_v_blocks_select_options_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_blocks_select_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_select" ADD CONSTRAINT "_stall_forms_v_blocks_select_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_select_locales" ADD CONSTRAINT "_stall_forms_v_blocks_select_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_blocks_select"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_state" ADD CONSTRAINT "_stall_forms_v_blocks_state_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_state_locales" ADD CONSTRAINT "_stall_forms_v_blocks_state_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_blocks_state"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_text" ADD CONSTRAINT "_stall_forms_v_blocks_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_text_locales" ADD CONSTRAINT "_stall_forms_v_blocks_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_blocks_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_textarea" ADD CONSTRAINT "_stall_forms_v_blocks_textarea_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_blocks_textarea_locales" ADD CONSTRAINT "_stall_forms_v_blocks_textarea_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_blocks_textarea"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_version_emails" ADD CONSTRAINT "_stall_forms_v_version_emails_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_version_emails_locales" ADD CONSTRAINT "_stall_forms_v_version_emails_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v_version_emails"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_forms_v" ADD CONSTRAINT "_stall_forms_v_parent_id_stall_forms_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_forms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_forms_v" ADD CONSTRAINT "_stall_forms_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_forms_v" ADD CONSTRAINT "_stall_forms_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_forms_v_locales" ADD CONSTRAINT "_stall_forms_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_forms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_form_submissions_submission_data" ADD CONSTRAINT "stall_form_submissions_submission_data_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."stall_form_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "stall_form_submissions" ADD CONSTRAINT "stall_form_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_form_submissions" ADD CONSTRAINT "stall_form_submissions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "stall_form_submissions" ADD CONSTRAINT "stall_form_submissions_form_id_stall_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."stall_forms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_form_submissions_v_version_submission_data" ADD CONSTRAINT "_stall_form_submissions_v_version_submission_data_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_stall_form_submissions_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_stall_form_submissions_v" ADD CONSTRAINT "_stall_form_submissions_v_parent_id_stall_form_submissions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stall_form_submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_form_submissions_v" ADD CONSTRAINT "_stall_form_submissions_v_version_tenant_id_tenants_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_form_submissions_v" ADD CONSTRAINT "_stall_form_submissions_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_stall_form_submissions_v" ADD CONSTRAINT "_stall_form_submissions_v_version_form_id_stall_forms_id_fk" FOREIGN KEY ("version_form_id") REFERENCES "public"."stall_forms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sites_modules_order_idx" ON "sites_modules" USING btree ("order");
  CREATE INDEX "sites_modules_parent_idx" ON "sites_modules" USING btree ("parent_id");
  CREATE INDEX "sites_locales_order_idx" ON "sites_locales" USING btree ("order");
  CREATE INDEX "sites_locales_parent_idx" ON "sites_locales" USING btree ("parent_id");
  CREATE INDEX "sites_tenant_idx" ON "sites" USING btree ("tenant_id");
  CREATE UNIQUE INDEX "sites_key_idx" ON "sites" USING btree ("key");
  CREATE INDEX "sites_updated_at_idx" ON "sites" USING btree ("updated_at");
  CREATE INDEX "sites_created_at_idx" ON "sites" USING btree ("created_at");
  CREATE INDEX "_sites_v_version_modules_order_idx" ON "_sites_v_version_modules" USING btree ("order");
  CREATE INDEX "_sites_v_version_modules_parent_idx" ON "_sites_v_version_modules" USING btree ("parent_id");
  CREATE INDEX "_sites_v_version_locales_order_idx" ON "_sites_v_version_locales" USING btree ("order");
  CREATE INDEX "_sites_v_version_locales_parent_idx" ON "_sites_v_version_locales" USING btree ("parent_id");
  CREATE INDEX "_sites_v_parent_idx" ON "_sites_v" USING btree ("parent_id");
  CREATE INDEX "_sites_v_version_version_tenant_idx" ON "_sites_v" USING btree ("version_tenant_id");
  CREATE INDEX "_sites_v_version_version_key_idx" ON "_sites_v" USING btree ("version_key");
  CREATE INDEX "_sites_v_version_version_updated_at_idx" ON "_sites_v" USING btree ("version_updated_at");
  CREATE INDEX "_sites_v_version_version_created_at_idx" ON "_sites_v" USING btree ("version_created_at");
  CREATE INDEX "_sites_v_created_at_idx" ON "_sites_v" USING btree ("created_at");
  CREATE INDEX "_sites_v_updated_at_idx" ON "_sites_v" USING btree ("updated_at");
  CREATE INDEX "integrations_scopes_order_idx" ON "integrations_scopes" USING btree ("order");
  CREATE INDEX "integrations_scopes_parent_idx" ON "integrations_scopes" USING btree ("parent_id");
  CREATE INDEX "integrations_site_idx" ON "integrations" USING btree ("site_id");
  CREATE INDEX "integrations_updated_at_idx" ON "integrations" USING btree ("updated_at");
  CREATE INDEX "integrations_created_at_idx" ON "integrations" USING btree ("created_at");
  CREATE INDEX "clients_tenant_idx" ON "clients" USING btree ("tenant_id");
  CREATE INDEX "clients_site_idx" ON "clients" USING btree ("site_id");
  CREATE INDEX "clients_updated_at_idx" ON "clients" USING btree ("updated_at");
  CREATE INDEX "clients_created_at_idx" ON "clients" USING btree ("created_at");
  CREATE INDEX "projects_technologies_order_idx" ON "projects_technologies" USING btree ("_order");
  CREATE INDEX "projects_technologies_parent_id_idx" ON "projects_technologies" USING btree ("_parent_id");
  CREATE INDEX "projects_links_order_idx" ON "projects_links" USING btree ("_order");
  CREATE INDEX "projects_links_parent_id_idx" ON "projects_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "projects_links_locales_locale_parent_id_unique" ON "projects_links_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "projects_tenant_idx" ON "projects" USING btree ("tenant_id");
  CREATE INDEX "projects_site_idx" ON "projects" USING btree ("site_id");
  CREATE INDEX "projects_slug_idx" ON "projects" USING btree ("slug");
  CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");
  CREATE INDEX "projects_image_idx" ON "projects" USING btree ("image_id");
  CREATE INDEX "projects_updated_at_idx" ON "projects" USING btree ("updated_at");
  CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_slug_idx" ON "projects" USING btree ("site_id","slug");
  CREATE INDEX "projects__status_idx" ON "projects_locales" USING btree ("_status","_locale");
  CREATE UNIQUE INDEX "projects_locales_locale_parent_id_unique" ON "projects_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_projects_v_version_technologies_order_idx" ON "_projects_v_version_technologies" USING btree ("_order");
  CREATE INDEX "_projects_v_version_technologies_parent_id_idx" ON "_projects_v_version_technologies" USING btree ("_parent_id");
  CREATE INDEX "_projects_v_version_links_order_idx" ON "_projects_v_version_links" USING btree ("_order");
  CREATE INDEX "_projects_v_version_links_parent_id_idx" ON "_projects_v_version_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_projects_v_version_links_locales_locale_parent_id_unique" ON "_projects_v_version_links_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_projects_v_parent_idx" ON "_projects_v" USING btree ("parent_id");
  CREATE INDEX "_projects_v_version_version_tenant_idx" ON "_projects_v" USING btree ("version_tenant_id");
  CREATE INDEX "_projects_v_version_version_site_idx" ON "_projects_v" USING btree ("version_site_id");
  CREATE INDEX "_projects_v_version_version_slug_idx" ON "_projects_v" USING btree ("version_slug");
  CREATE INDEX "_projects_v_version_version_client_idx" ON "_projects_v" USING btree ("version_client_id");
  CREATE INDEX "_projects_v_version_version_image_idx" ON "_projects_v" USING btree ("version_image_id");
  CREATE INDEX "_projects_v_version_version_updated_at_idx" ON "_projects_v" USING btree ("version_updated_at");
  CREATE INDEX "_projects_v_version_version_created_at_idx" ON "_projects_v" USING btree ("version_created_at");
  CREATE INDEX "_projects_v_created_at_idx" ON "_projects_v" USING btree ("created_at");
  CREATE INDEX "_projects_v_updated_at_idx" ON "_projects_v" USING btree ("updated_at");
  CREATE INDEX "_projects_v_published_locale_idx" ON "_projects_v" USING btree ("published_locale");
  CREATE INDEX "_projects_v_latest_idx" ON "_projects_v" USING btree ("latest");
  CREATE INDEX "version_site_version_slug_idx" ON "_projects_v" USING btree ("version_site_id","version_slug");
  CREATE INDEX "_projects_v_version_version__status_idx" ON "_projects_v_locales" USING btree ("version__status","_locale");
  CREATE UNIQUE INDEX "_projects_v_locales_locale_parent_id_unique" ON "_projects_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "website_settings_tenant_idx" ON "website_settings" USING btree ("tenant_id");
  CREATE UNIQUE INDEX "website_settings_site_idx" ON "website_settings" USING btree ("site_id");
  CREATE INDEX "website_settings_updated_at_idx" ON "website_settings" USING btree ("updated_at");
  CREATE INDEX "website_settings_created_at_idx" ON "website_settings" USING btree ("created_at");
  CREATE INDEX "media_tenant_idx" ON "media" USING btree ("tenant_id");
  CREATE INDEX "media_site_idx" ON "media" USING btree ("site_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_square_sizes_square_filename_idx" ON "media" USING btree ("sizes_square_filename");
  CREATE INDEX "media_sizes_small_sizes_small_filename_idx" ON "media" USING btree ("sizes_small_filename");
  CREATE INDEX "media_sizes_medium_sizes_medium_filename_idx" ON "media" USING btree ("sizes_medium_filename");
  CREATE INDEX "media_sizes_large_sizes_large_filename_idx" ON "media" USING btree ("sizes_large_filename");
  CREATE INDEX "media_sizes_xlarge_sizes_xlarge_filename_idx" ON "media" USING btree ("sizes_xlarge_filename");
  CREATE INDEX "media_sizes_og_sizes_og_filename_idx" ON "media" USING btree ("sizes_og_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "media_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_pages_hero_links_order_idx" ON "stall_pages_hero_links" USING btree ("_order");
  CREATE INDEX "stall_pages_hero_links_parent_id_idx" ON "stall_pages_hero_links" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_services_items_order_idx" ON "stall_pages_blocks_services_items" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_services_items_parent_id_idx" ON "stall_pages_blocks_services_items" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_services_order_idx" ON "stall_pages_blocks_services" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_services_parent_id_idx" ON "stall_pages_blocks_services" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_services_path_idx" ON "stall_pages_blocks_services" USING btree ("_path");
  CREATE INDEX "stall_pages_blocks_facilities_items_order_idx" ON "stall_pages_blocks_facilities_items" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_facilities_items_parent_id_idx" ON "stall_pages_blocks_facilities_items" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_facilities_order_idx" ON "stall_pages_blocks_facilities" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_facilities_parent_id_idx" ON "stall_pages_blocks_facilities" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_facilities_path_idx" ON "stall_pages_blocks_facilities" USING btree ("_path");
  CREATE INDEX "stall_pages_blocks_content_columns_order_idx" ON "stall_pages_blocks_content_columns" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_content_columns_parent_id_idx" ON "stall_pages_blocks_content_columns" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_content_order_idx" ON "stall_pages_blocks_content" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_content_parent_id_idx" ON "stall_pages_blocks_content" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_content_path_idx" ON "stall_pages_blocks_content" USING btree ("_path");
  CREATE INDEX "stall_pages_blocks_media_block_order_idx" ON "stall_pages_blocks_media_block" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_media_block_parent_id_idx" ON "stall_pages_blocks_media_block" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_media_block_path_idx" ON "stall_pages_blocks_media_block" USING btree ("_path");
  CREATE INDEX "stall_pages_blocks_media_block_media_idx" ON "stall_pages_blocks_media_block" USING btree ("media_id");
  CREATE INDEX "stall_pages_blocks_gallery_order_idx" ON "stall_pages_blocks_gallery" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_gallery_parent_id_idx" ON "stall_pages_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_gallery_path_idx" ON "stall_pages_blocks_gallery" USING btree ("_path");
  CREATE INDEX "stall_pages_blocks_team_members_order_idx" ON "stall_pages_blocks_team_members" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_team_members_parent_id_idx" ON "stall_pages_blocks_team_members" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_team_members_photo_idx" ON "stall_pages_blocks_team_members" USING btree ("photo_id");
  CREATE INDEX "stall_pages_blocks_team_order_idx" ON "stall_pages_blocks_team" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_team_parent_id_idx" ON "stall_pages_blocks_team" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_team_path_idx" ON "stall_pages_blocks_team" USING btree ("_path");
  CREATE INDEX "stall_pages_blocks_contact_order_idx" ON "stall_pages_blocks_contact" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_contact_parent_id_idx" ON "stall_pages_blocks_contact" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_contact_path_idx" ON "stall_pages_blocks_contact" USING btree ("_path");
  CREATE INDEX "stall_pages_blocks_cta_links_order_idx" ON "stall_pages_blocks_cta_links" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_cta_links_parent_id_idx" ON "stall_pages_blocks_cta_links" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_cta_order_idx" ON "stall_pages_blocks_cta" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_cta_parent_id_idx" ON "stall_pages_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_cta_path_idx" ON "stall_pages_blocks_cta" USING btree ("_path");
  CREATE INDEX "stall_pages_blocks_form_block_order_idx" ON "stall_pages_blocks_form_block" USING btree ("_order");
  CREATE INDEX "stall_pages_blocks_form_block_parent_id_idx" ON "stall_pages_blocks_form_block" USING btree ("_parent_id");
  CREATE INDEX "stall_pages_blocks_form_block_path_idx" ON "stall_pages_blocks_form_block" USING btree ("_path");
  CREATE INDEX "stall_pages_blocks_form_block_form_idx" ON "stall_pages_blocks_form_block" USING btree ("form_id");
  CREATE INDEX "stall_pages_tenant_idx" ON "stall_pages" USING btree ("tenant_id");
  CREATE INDEX "stall_pages_site_idx" ON "stall_pages" USING btree ("site_id");
  CREATE INDEX "stall_pages_slug_idx" ON "stall_pages" USING btree ("slug");
  CREATE INDEX "stall_pages_hero_hero_media_idx" ON "stall_pages" USING btree ("hero_media_id");
  CREATE INDEX "stall_pages_meta_meta_image_idx" ON "stall_pages" USING btree ("meta_image_id");
  CREATE INDEX "stall_pages_updated_at_idx" ON "stall_pages" USING btree ("updated_at");
  CREATE INDEX "stall_pages_created_at_idx" ON "stall_pages" USING btree ("created_at");
  CREATE INDEX "stall_pages__status_idx" ON "stall_pages" USING btree ("_status");
  CREATE UNIQUE INDEX "site_slug_1_idx" ON "stall_pages" USING btree ("site_id","slug");
  CREATE INDEX "stall_pages_rels_order_idx" ON "stall_pages_rels" USING btree ("order");
  CREATE INDEX "stall_pages_rels_parent_idx" ON "stall_pages_rels" USING btree ("parent_id");
  CREATE INDEX "stall_pages_rels_path_idx" ON "stall_pages_rels" USING btree ("path");
  CREATE INDEX "stall_pages_rels_stall_pages_id_idx" ON "stall_pages_rels" USING btree ("stall_pages_id");
  CREATE INDEX "stall_pages_rels_media_id_idx" ON "stall_pages_rels" USING btree ("media_id");
  CREATE INDEX "_stall_pages_v_version_hero_links_order_idx" ON "_stall_pages_v_version_hero_links" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_version_hero_links_parent_id_idx" ON "_stall_pages_v_version_hero_links" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_services_items_order_idx" ON "_stall_pages_v_blocks_services_items" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_services_items_parent_id_idx" ON "_stall_pages_v_blocks_services_items" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_services_order_idx" ON "_stall_pages_v_blocks_services" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_services_parent_id_idx" ON "_stall_pages_v_blocks_services" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_services_path_idx" ON "_stall_pages_v_blocks_services" USING btree ("_path");
  CREATE INDEX "_stall_pages_v_blocks_facilities_items_order_idx" ON "_stall_pages_v_blocks_facilities_items" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_facilities_items_parent_id_idx" ON "_stall_pages_v_blocks_facilities_items" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_facilities_order_idx" ON "_stall_pages_v_blocks_facilities" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_facilities_parent_id_idx" ON "_stall_pages_v_blocks_facilities" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_facilities_path_idx" ON "_stall_pages_v_blocks_facilities" USING btree ("_path");
  CREATE INDEX "_stall_pages_v_blocks_content_columns_order_idx" ON "_stall_pages_v_blocks_content_columns" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_content_columns_parent_id_idx" ON "_stall_pages_v_blocks_content_columns" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_content_order_idx" ON "_stall_pages_v_blocks_content" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_content_parent_id_idx" ON "_stall_pages_v_blocks_content" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_content_path_idx" ON "_stall_pages_v_blocks_content" USING btree ("_path");
  CREATE INDEX "_stall_pages_v_blocks_media_block_order_idx" ON "_stall_pages_v_blocks_media_block" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_media_block_parent_id_idx" ON "_stall_pages_v_blocks_media_block" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_media_block_path_idx" ON "_stall_pages_v_blocks_media_block" USING btree ("_path");
  CREATE INDEX "_stall_pages_v_blocks_media_block_media_idx" ON "_stall_pages_v_blocks_media_block" USING btree ("media_id");
  CREATE INDEX "_stall_pages_v_blocks_gallery_order_idx" ON "_stall_pages_v_blocks_gallery" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_gallery_parent_id_idx" ON "_stall_pages_v_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_gallery_path_idx" ON "_stall_pages_v_blocks_gallery" USING btree ("_path");
  CREATE INDEX "_stall_pages_v_blocks_team_members_order_idx" ON "_stall_pages_v_blocks_team_members" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_team_members_parent_id_idx" ON "_stall_pages_v_blocks_team_members" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_team_members_photo_idx" ON "_stall_pages_v_blocks_team_members" USING btree ("photo_id");
  CREATE INDEX "_stall_pages_v_blocks_team_order_idx" ON "_stall_pages_v_blocks_team" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_team_parent_id_idx" ON "_stall_pages_v_blocks_team" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_team_path_idx" ON "_stall_pages_v_blocks_team" USING btree ("_path");
  CREATE INDEX "_stall_pages_v_blocks_contact_order_idx" ON "_stall_pages_v_blocks_contact" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_contact_parent_id_idx" ON "_stall_pages_v_blocks_contact" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_contact_path_idx" ON "_stall_pages_v_blocks_contact" USING btree ("_path");
  CREATE INDEX "_stall_pages_v_blocks_cta_links_order_idx" ON "_stall_pages_v_blocks_cta_links" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_cta_links_parent_id_idx" ON "_stall_pages_v_blocks_cta_links" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_cta_order_idx" ON "_stall_pages_v_blocks_cta" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_cta_parent_id_idx" ON "_stall_pages_v_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_cta_path_idx" ON "_stall_pages_v_blocks_cta" USING btree ("_path");
  CREATE INDEX "_stall_pages_v_blocks_form_block_order_idx" ON "_stall_pages_v_blocks_form_block" USING btree ("_order");
  CREATE INDEX "_stall_pages_v_blocks_form_block_parent_id_idx" ON "_stall_pages_v_blocks_form_block" USING btree ("_parent_id");
  CREATE INDEX "_stall_pages_v_blocks_form_block_path_idx" ON "_stall_pages_v_blocks_form_block" USING btree ("_path");
  CREATE INDEX "_stall_pages_v_blocks_form_block_form_idx" ON "_stall_pages_v_blocks_form_block" USING btree ("form_id");
  CREATE INDEX "_stall_pages_v_parent_idx" ON "_stall_pages_v" USING btree ("parent_id");
  CREATE INDEX "_stall_pages_v_version_version_tenant_idx" ON "_stall_pages_v" USING btree ("version_tenant_id");
  CREATE INDEX "_stall_pages_v_version_version_site_idx" ON "_stall_pages_v" USING btree ("version_site_id");
  CREATE INDEX "_stall_pages_v_version_version_slug_idx" ON "_stall_pages_v" USING btree ("version_slug");
  CREATE INDEX "_stall_pages_v_version_hero_version_hero_media_idx" ON "_stall_pages_v" USING btree ("version_hero_media_id");
  CREATE INDEX "_stall_pages_v_version_meta_version_meta_image_idx" ON "_stall_pages_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_stall_pages_v_version_version_updated_at_idx" ON "_stall_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_stall_pages_v_version_version_created_at_idx" ON "_stall_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_stall_pages_v_version_version__status_idx" ON "_stall_pages_v" USING btree ("version__status");
  CREATE INDEX "_stall_pages_v_created_at_idx" ON "_stall_pages_v" USING btree ("created_at");
  CREATE INDEX "_stall_pages_v_updated_at_idx" ON "_stall_pages_v" USING btree ("updated_at");
  CREATE INDEX "_stall_pages_v_published_locale_idx" ON "_stall_pages_v" USING btree ("published_locale");
  CREATE INDEX "_stall_pages_v_latest_idx" ON "_stall_pages_v" USING btree ("latest");
  CREATE INDEX "_stall_pages_v_autosave_idx" ON "_stall_pages_v" USING btree ("autosave");
  CREATE INDEX "version_site_version_slug_1_idx" ON "_stall_pages_v" USING btree ("version_site_id","version_slug");
  CREATE INDEX "_stall_pages_v_rels_order_idx" ON "_stall_pages_v_rels" USING btree ("order");
  CREATE INDEX "_stall_pages_v_rels_parent_idx" ON "_stall_pages_v_rels" USING btree ("parent_id");
  CREATE INDEX "_stall_pages_v_rels_path_idx" ON "_stall_pages_v_rels" USING btree ("path");
  CREATE INDEX "_stall_pages_v_rels_stall_pages_id_idx" ON "_stall_pages_v_rels" USING btree ("stall_pages_id");
  CREATE INDEX "_stall_pages_v_rels_media_id_idx" ON "_stall_pages_v_rels" USING btree ("media_id");
  CREATE INDEX "stall_settings_hours_days_order_idx" ON "stall_settings_hours_days" USING btree ("order");
  CREATE INDEX "stall_settings_hours_days_parent_idx" ON "stall_settings_hours_days" USING btree ("parent_id");
  CREATE INDEX "stall_settings_hours_order_idx" ON "stall_settings_hours" USING btree ("_order");
  CREATE INDEX "stall_settings_hours_parent_id_idx" ON "stall_settings_hours" USING btree ("_parent_id");
  CREATE INDEX "stall_settings_tenant_idx" ON "stall_settings" USING btree ("tenant_id");
  CREATE UNIQUE INDEX "stall_settings_site_idx" ON "stall_settings" USING btree ("site_id");
  CREATE INDEX "stall_settings_updated_at_idx" ON "stall_settings" USING btree ("updated_at");
  CREATE INDEX "stall_settings_created_at_idx" ON "stall_settings" USING btree ("created_at");
  CREATE INDEX "_stall_settings_v_version_hours_days_order_idx" ON "_stall_settings_v_version_hours_days" USING btree ("order");
  CREATE INDEX "_stall_settings_v_version_hours_days_parent_idx" ON "_stall_settings_v_version_hours_days" USING btree ("parent_id");
  CREATE INDEX "_stall_settings_v_version_hours_order_idx" ON "_stall_settings_v_version_hours" USING btree ("_order");
  CREATE INDEX "_stall_settings_v_version_hours_parent_id_idx" ON "_stall_settings_v_version_hours" USING btree ("_parent_id");
  CREATE INDEX "_stall_settings_v_parent_idx" ON "_stall_settings_v" USING btree ("parent_id");
  CREATE INDEX "_stall_settings_v_version_version_tenant_idx" ON "_stall_settings_v" USING btree ("version_tenant_id");
  CREATE INDEX "_stall_settings_v_version_version_site_idx" ON "_stall_settings_v" USING btree ("version_site_id");
  CREATE INDEX "_stall_settings_v_version_version_updated_at_idx" ON "_stall_settings_v" USING btree ("version_updated_at");
  CREATE INDEX "_stall_settings_v_version_version_created_at_idx" ON "_stall_settings_v" USING btree ("version_created_at");
  CREATE INDEX "_stall_settings_v_created_at_idx" ON "_stall_settings_v" USING btree ("created_at");
  CREATE INDEX "_stall_settings_v_updated_at_idx" ON "_stall_settings_v" USING btree ("updated_at");
  CREATE INDEX "stall_header_nav_items_order_idx" ON "stall_header_nav_items" USING btree ("_order");
  CREATE INDEX "stall_header_nav_items_parent_id_idx" ON "stall_header_nav_items" USING btree ("_parent_id");
  CREATE INDEX "stall_header_tenant_idx" ON "stall_header" USING btree ("tenant_id");
  CREATE UNIQUE INDEX "stall_header_site_idx" ON "stall_header" USING btree ("site_id");
  CREATE INDEX "stall_header_updated_at_idx" ON "stall_header" USING btree ("updated_at");
  CREATE INDEX "stall_header_created_at_idx" ON "stall_header" USING btree ("created_at");
  CREATE INDEX "stall_header_rels_order_idx" ON "stall_header_rels" USING btree ("order");
  CREATE INDEX "stall_header_rels_parent_idx" ON "stall_header_rels" USING btree ("parent_id");
  CREATE INDEX "stall_header_rels_path_idx" ON "stall_header_rels" USING btree ("path");
  CREATE INDEX "stall_header_rels_stall_pages_id_idx" ON "stall_header_rels" USING btree ("stall_pages_id");
  CREATE INDEX "_stall_header_v_version_nav_items_order_idx" ON "_stall_header_v_version_nav_items" USING btree ("_order");
  CREATE INDEX "_stall_header_v_version_nav_items_parent_id_idx" ON "_stall_header_v_version_nav_items" USING btree ("_parent_id");
  CREATE INDEX "_stall_header_v_parent_idx" ON "_stall_header_v" USING btree ("parent_id");
  CREATE INDEX "_stall_header_v_version_version_tenant_idx" ON "_stall_header_v" USING btree ("version_tenant_id");
  CREATE INDEX "_stall_header_v_version_version_site_idx" ON "_stall_header_v" USING btree ("version_site_id");
  CREATE INDEX "_stall_header_v_version_version_updated_at_idx" ON "_stall_header_v" USING btree ("version_updated_at");
  CREATE INDEX "_stall_header_v_version_version_created_at_idx" ON "_stall_header_v" USING btree ("version_created_at");
  CREATE INDEX "_stall_header_v_created_at_idx" ON "_stall_header_v" USING btree ("created_at");
  CREATE INDEX "_stall_header_v_updated_at_idx" ON "_stall_header_v" USING btree ("updated_at");
  CREATE INDEX "_stall_header_v_rels_order_idx" ON "_stall_header_v_rels" USING btree ("order");
  CREATE INDEX "_stall_header_v_rels_parent_idx" ON "_stall_header_v_rels" USING btree ("parent_id");
  CREATE INDEX "_stall_header_v_rels_path_idx" ON "_stall_header_v_rels" USING btree ("path");
  CREATE INDEX "_stall_header_v_rels_stall_pages_id_idx" ON "_stall_header_v_rels" USING btree ("stall_pages_id");
  CREATE INDEX "stall_footer_nav_items_order_idx" ON "stall_footer_nav_items" USING btree ("_order");
  CREATE INDEX "stall_footer_nav_items_parent_id_idx" ON "stall_footer_nav_items" USING btree ("_parent_id");
  CREATE INDEX "stall_footer_tenant_idx" ON "stall_footer" USING btree ("tenant_id");
  CREATE UNIQUE INDEX "stall_footer_site_idx" ON "stall_footer" USING btree ("site_id");
  CREATE INDEX "stall_footer_updated_at_idx" ON "stall_footer" USING btree ("updated_at");
  CREATE INDEX "stall_footer_created_at_idx" ON "stall_footer" USING btree ("created_at");
  CREATE INDEX "stall_footer_rels_order_idx" ON "stall_footer_rels" USING btree ("order");
  CREATE INDEX "stall_footer_rels_parent_idx" ON "stall_footer_rels" USING btree ("parent_id");
  CREATE INDEX "stall_footer_rels_path_idx" ON "stall_footer_rels" USING btree ("path");
  CREATE INDEX "stall_footer_rels_stall_pages_id_idx" ON "stall_footer_rels" USING btree ("stall_pages_id");
  CREATE INDEX "_stall_footer_v_version_nav_items_order_idx" ON "_stall_footer_v_version_nav_items" USING btree ("_order");
  CREATE INDEX "_stall_footer_v_version_nav_items_parent_id_idx" ON "_stall_footer_v_version_nav_items" USING btree ("_parent_id");
  CREATE INDEX "_stall_footer_v_parent_idx" ON "_stall_footer_v" USING btree ("parent_id");
  CREATE INDEX "_stall_footer_v_version_version_tenant_idx" ON "_stall_footer_v" USING btree ("version_tenant_id");
  CREATE INDEX "_stall_footer_v_version_version_site_idx" ON "_stall_footer_v" USING btree ("version_site_id");
  CREATE INDEX "_stall_footer_v_version_version_updated_at_idx" ON "_stall_footer_v" USING btree ("version_updated_at");
  CREATE INDEX "_stall_footer_v_version_version_created_at_idx" ON "_stall_footer_v" USING btree ("version_created_at");
  CREATE INDEX "_stall_footer_v_created_at_idx" ON "_stall_footer_v" USING btree ("created_at");
  CREATE INDEX "_stall_footer_v_updated_at_idx" ON "_stall_footer_v" USING btree ("updated_at");
  CREATE INDEX "_stall_footer_v_rels_order_idx" ON "_stall_footer_v_rels" USING btree ("order");
  CREATE INDEX "_stall_footer_v_rels_parent_idx" ON "_stall_footer_v_rels" USING btree ("parent_id");
  CREATE INDEX "_stall_footer_v_rels_path_idx" ON "_stall_footer_v_rels" USING btree ("path");
  CREATE INDEX "_stall_footer_v_rels_stall_pages_id_idx" ON "_stall_footer_v_rels" USING btree ("stall_pages_id");
  CREATE INDEX "stall_redirects_tenant_idx" ON "stall_redirects" USING btree ("tenant_id");
  CREATE INDEX "stall_redirects_site_idx" ON "stall_redirects" USING btree ("site_id");
  CREATE INDEX "stall_redirects_updated_at_idx" ON "stall_redirects" USING btree ("updated_at");
  CREATE INDEX "stall_redirects_created_at_idx" ON "stall_redirects" USING btree ("created_at");
  CREATE INDEX "stall_redirects_rels_order_idx" ON "stall_redirects_rels" USING btree ("order");
  CREATE INDEX "stall_redirects_rels_parent_idx" ON "stall_redirects_rels" USING btree ("parent_id");
  CREATE INDEX "stall_redirects_rels_path_idx" ON "stall_redirects_rels" USING btree ("path");
  CREATE INDEX "stall_redirects_rels_stall_pages_id_idx" ON "stall_redirects_rels" USING btree ("stall_pages_id");
  CREATE INDEX "_stall_redirects_v_parent_idx" ON "_stall_redirects_v" USING btree ("parent_id");
  CREATE INDEX "_stall_redirects_v_version_version_tenant_idx" ON "_stall_redirects_v" USING btree ("version_tenant_id");
  CREATE INDEX "_stall_redirects_v_version_version_site_idx" ON "_stall_redirects_v" USING btree ("version_site_id");
  CREATE INDEX "_stall_redirects_v_version_version_updated_at_idx" ON "_stall_redirects_v" USING btree ("version_updated_at");
  CREATE INDEX "_stall_redirects_v_version_version_created_at_idx" ON "_stall_redirects_v" USING btree ("version_created_at");
  CREATE INDEX "_stall_redirects_v_created_at_idx" ON "_stall_redirects_v" USING btree ("created_at");
  CREATE INDEX "_stall_redirects_v_updated_at_idx" ON "_stall_redirects_v" USING btree ("updated_at");
  CREATE INDEX "_stall_redirects_v_rels_order_idx" ON "_stall_redirects_v_rels" USING btree ("order");
  CREATE INDEX "_stall_redirects_v_rels_parent_idx" ON "_stall_redirects_v_rels" USING btree ("parent_id");
  CREATE INDEX "_stall_redirects_v_rels_path_idx" ON "_stall_redirects_v_rels" USING btree ("path");
  CREATE INDEX "_stall_redirects_v_rels_stall_pages_id_idx" ON "_stall_redirects_v_rels" USING btree ("stall_pages_id");
  CREATE INDEX "stall_forms_blocks_checkbox_order_idx" ON "stall_forms_blocks_checkbox" USING btree ("_order");
  CREATE INDEX "stall_forms_blocks_checkbox_parent_id_idx" ON "stall_forms_blocks_checkbox" USING btree ("_parent_id");
  CREATE INDEX "stall_forms_blocks_checkbox_path_idx" ON "stall_forms_blocks_checkbox" USING btree ("_path");
  CREATE UNIQUE INDEX "stall_forms_blocks_checkbox_locales_locale_parent_id_unique" ON "stall_forms_blocks_checkbox_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_forms_blocks_country_order_idx" ON "stall_forms_blocks_country" USING btree ("_order");
  CREATE INDEX "stall_forms_blocks_country_parent_id_idx" ON "stall_forms_blocks_country" USING btree ("_parent_id");
  CREATE INDEX "stall_forms_blocks_country_path_idx" ON "stall_forms_blocks_country" USING btree ("_path");
  CREATE UNIQUE INDEX "stall_forms_blocks_country_locales_locale_parent_id_unique" ON "stall_forms_blocks_country_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_forms_blocks_email_order_idx" ON "stall_forms_blocks_email" USING btree ("_order");
  CREATE INDEX "stall_forms_blocks_email_parent_id_idx" ON "stall_forms_blocks_email" USING btree ("_parent_id");
  CREATE INDEX "stall_forms_blocks_email_path_idx" ON "stall_forms_blocks_email" USING btree ("_path");
  CREATE UNIQUE INDEX "stall_forms_blocks_email_locales_locale_parent_id_unique" ON "stall_forms_blocks_email_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_forms_blocks_message_order_idx" ON "stall_forms_blocks_message" USING btree ("_order");
  CREATE INDEX "stall_forms_blocks_message_parent_id_idx" ON "stall_forms_blocks_message" USING btree ("_parent_id");
  CREATE INDEX "stall_forms_blocks_message_path_idx" ON "stall_forms_blocks_message" USING btree ("_path");
  CREATE UNIQUE INDEX "stall_forms_blocks_message_locales_locale_parent_id_unique" ON "stall_forms_blocks_message_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_forms_blocks_number_order_idx" ON "stall_forms_blocks_number" USING btree ("_order");
  CREATE INDEX "stall_forms_blocks_number_parent_id_idx" ON "stall_forms_blocks_number" USING btree ("_parent_id");
  CREATE INDEX "stall_forms_blocks_number_path_idx" ON "stall_forms_blocks_number" USING btree ("_path");
  CREATE UNIQUE INDEX "stall_forms_blocks_number_locales_locale_parent_id_unique" ON "stall_forms_blocks_number_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_forms_blocks_select_options_order_idx" ON "stall_forms_blocks_select_options" USING btree ("_order");
  CREATE INDEX "stall_forms_blocks_select_options_parent_id_idx" ON "stall_forms_blocks_select_options" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "stall_forms_blocks_select_options_locales_locale_parent_id_u" ON "stall_forms_blocks_select_options_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_forms_blocks_select_order_idx" ON "stall_forms_blocks_select" USING btree ("_order");
  CREATE INDEX "stall_forms_blocks_select_parent_id_idx" ON "stall_forms_blocks_select" USING btree ("_parent_id");
  CREATE INDEX "stall_forms_blocks_select_path_idx" ON "stall_forms_blocks_select" USING btree ("_path");
  CREATE UNIQUE INDEX "stall_forms_blocks_select_locales_locale_parent_id_unique" ON "stall_forms_blocks_select_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_forms_blocks_state_order_idx" ON "stall_forms_blocks_state" USING btree ("_order");
  CREATE INDEX "stall_forms_blocks_state_parent_id_idx" ON "stall_forms_blocks_state" USING btree ("_parent_id");
  CREATE INDEX "stall_forms_blocks_state_path_idx" ON "stall_forms_blocks_state" USING btree ("_path");
  CREATE UNIQUE INDEX "stall_forms_blocks_state_locales_locale_parent_id_unique" ON "stall_forms_blocks_state_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_forms_blocks_text_order_idx" ON "stall_forms_blocks_text" USING btree ("_order");
  CREATE INDEX "stall_forms_blocks_text_parent_id_idx" ON "stall_forms_blocks_text" USING btree ("_parent_id");
  CREATE INDEX "stall_forms_blocks_text_path_idx" ON "stall_forms_blocks_text" USING btree ("_path");
  CREATE UNIQUE INDEX "stall_forms_blocks_text_locales_locale_parent_id_unique" ON "stall_forms_blocks_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_forms_blocks_textarea_order_idx" ON "stall_forms_blocks_textarea" USING btree ("_order");
  CREATE INDEX "stall_forms_blocks_textarea_parent_id_idx" ON "stall_forms_blocks_textarea" USING btree ("_parent_id");
  CREATE INDEX "stall_forms_blocks_textarea_path_idx" ON "stall_forms_blocks_textarea" USING btree ("_path");
  CREATE UNIQUE INDEX "stall_forms_blocks_textarea_locales_locale_parent_id_unique" ON "stall_forms_blocks_textarea_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_forms_emails_order_idx" ON "stall_forms_emails" USING btree ("_order");
  CREATE INDEX "stall_forms_emails_parent_id_idx" ON "stall_forms_emails" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "stall_forms_emails_locales_locale_parent_id_unique" ON "stall_forms_emails_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_forms_tenant_idx" ON "stall_forms" USING btree ("tenant_id");
  CREATE INDEX "stall_forms_site_idx" ON "stall_forms" USING btree ("site_id");
  CREATE INDEX "stall_forms_updated_at_idx" ON "stall_forms" USING btree ("updated_at");
  CREATE INDEX "stall_forms_created_at_idx" ON "stall_forms" USING btree ("created_at");
  CREATE UNIQUE INDEX "stall_forms_locales_locale_parent_id_unique" ON "stall_forms_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_checkbox_order_idx" ON "_stall_forms_v_blocks_checkbox" USING btree ("_order");
  CREATE INDEX "_stall_forms_v_blocks_checkbox_parent_id_idx" ON "_stall_forms_v_blocks_checkbox" USING btree ("_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_checkbox_path_idx" ON "_stall_forms_v_blocks_checkbox" USING btree ("_path");
  CREATE UNIQUE INDEX "_stall_forms_v_blocks_checkbox_locales_locale_parent_id_uniq" ON "_stall_forms_v_blocks_checkbox_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_country_order_idx" ON "_stall_forms_v_blocks_country" USING btree ("_order");
  CREATE INDEX "_stall_forms_v_blocks_country_parent_id_idx" ON "_stall_forms_v_blocks_country" USING btree ("_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_country_path_idx" ON "_stall_forms_v_blocks_country" USING btree ("_path");
  CREATE UNIQUE INDEX "_stall_forms_v_blocks_country_locales_locale_parent_id_uniqu" ON "_stall_forms_v_blocks_country_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_email_order_idx" ON "_stall_forms_v_blocks_email" USING btree ("_order");
  CREATE INDEX "_stall_forms_v_blocks_email_parent_id_idx" ON "_stall_forms_v_blocks_email" USING btree ("_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_email_path_idx" ON "_stall_forms_v_blocks_email" USING btree ("_path");
  CREATE UNIQUE INDEX "_stall_forms_v_blocks_email_locales_locale_parent_id_unique" ON "_stall_forms_v_blocks_email_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_message_order_idx" ON "_stall_forms_v_blocks_message" USING btree ("_order");
  CREATE INDEX "_stall_forms_v_blocks_message_parent_id_idx" ON "_stall_forms_v_blocks_message" USING btree ("_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_message_path_idx" ON "_stall_forms_v_blocks_message" USING btree ("_path");
  CREATE UNIQUE INDEX "_stall_forms_v_blocks_message_locales_locale_parent_id_uniqu" ON "_stall_forms_v_blocks_message_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_number_order_idx" ON "_stall_forms_v_blocks_number" USING btree ("_order");
  CREATE INDEX "_stall_forms_v_blocks_number_parent_id_idx" ON "_stall_forms_v_blocks_number" USING btree ("_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_number_path_idx" ON "_stall_forms_v_blocks_number" USING btree ("_path");
  CREATE UNIQUE INDEX "_stall_forms_v_blocks_number_locales_locale_parent_id_unique" ON "_stall_forms_v_blocks_number_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_select_options_order_idx" ON "_stall_forms_v_blocks_select_options" USING btree ("_order");
  CREATE INDEX "_stall_forms_v_blocks_select_options_parent_id_idx" ON "_stall_forms_v_blocks_select_options" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_stall_forms_v_blocks_select_options_locales_locale_parent_i" ON "_stall_forms_v_blocks_select_options_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_select_order_idx" ON "_stall_forms_v_blocks_select" USING btree ("_order");
  CREATE INDEX "_stall_forms_v_blocks_select_parent_id_idx" ON "_stall_forms_v_blocks_select" USING btree ("_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_select_path_idx" ON "_stall_forms_v_blocks_select" USING btree ("_path");
  CREATE UNIQUE INDEX "_stall_forms_v_blocks_select_locales_locale_parent_id_unique" ON "_stall_forms_v_blocks_select_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_state_order_idx" ON "_stall_forms_v_blocks_state" USING btree ("_order");
  CREATE INDEX "_stall_forms_v_blocks_state_parent_id_idx" ON "_stall_forms_v_blocks_state" USING btree ("_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_state_path_idx" ON "_stall_forms_v_blocks_state" USING btree ("_path");
  CREATE UNIQUE INDEX "_stall_forms_v_blocks_state_locales_locale_parent_id_unique" ON "_stall_forms_v_blocks_state_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_text_order_idx" ON "_stall_forms_v_blocks_text" USING btree ("_order");
  CREATE INDEX "_stall_forms_v_blocks_text_parent_id_idx" ON "_stall_forms_v_blocks_text" USING btree ("_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_text_path_idx" ON "_stall_forms_v_blocks_text" USING btree ("_path");
  CREATE UNIQUE INDEX "_stall_forms_v_blocks_text_locales_locale_parent_id_unique" ON "_stall_forms_v_blocks_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_textarea_order_idx" ON "_stall_forms_v_blocks_textarea" USING btree ("_order");
  CREATE INDEX "_stall_forms_v_blocks_textarea_parent_id_idx" ON "_stall_forms_v_blocks_textarea" USING btree ("_parent_id");
  CREATE INDEX "_stall_forms_v_blocks_textarea_path_idx" ON "_stall_forms_v_blocks_textarea" USING btree ("_path");
  CREATE UNIQUE INDEX "_stall_forms_v_blocks_textarea_locales_locale_parent_id_uniq" ON "_stall_forms_v_blocks_textarea_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_version_emails_order_idx" ON "_stall_forms_v_version_emails" USING btree ("_order");
  CREATE INDEX "_stall_forms_v_version_emails_parent_id_idx" ON "_stall_forms_v_version_emails" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_stall_forms_v_version_emails_locales_locale_parent_id_uniqu" ON "_stall_forms_v_version_emails_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_stall_forms_v_parent_idx" ON "_stall_forms_v" USING btree ("parent_id");
  CREATE INDEX "_stall_forms_v_version_version_tenant_idx" ON "_stall_forms_v" USING btree ("version_tenant_id");
  CREATE INDEX "_stall_forms_v_version_version_site_idx" ON "_stall_forms_v" USING btree ("version_site_id");
  CREATE INDEX "_stall_forms_v_version_version_updated_at_idx" ON "_stall_forms_v" USING btree ("version_updated_at");
  CREATE INDEX "_stall_forms_v_version_version_created_at_idx" ON "_stall_forms_v" USING btree ("version_created_at");
  CREATE INDEX "_stall_forms_v_created_at_idx" ON "_stall_forms_v" USING btree ("created_at");
  CREATE INDEX "_stall_forms_v_updated_at_idx" ON "_stall_forms_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_stall_forms_v_locales_locale_parent_id_unique" ON "_stall_forms_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "stall_form_submissions_submission_data_order_idx" ON "stall_form_submissions_submission_data" USING btree ("_order");
  CREATE INDEX "stall_form_submissions_submission_data_parent_id_idx" ON "stall_form_submissions_submission_data" USING btree ("_parent_id");
  CREATE INDEX "stall_form_submissions_tenant_idx" ON "stall_form_submissions" USING btree ("tenant_id");
  CREATE INDEX "stall_form_submissions_site_idx" ON "stall_form_submissions" USING btree ("site_id");
  CREATE INDEX "stall_form_submissions_form_idx" ON "stall_form_submissions" USING btree ("form_id");
  CREATE INDEX "stall_form_submissions_updated_at_idx" ON "stall_form_submissions" USING btree ("updated_at");
  CREATE INDEX "stall_form_submissions_created_at_idx" ON "stall_form_submissions" USING btree ("created_at");
  CREATE INDEX "_stall_form_submissions_v_version_submission_data_order_idx" ON "_stall_form_submissions_v_version_submission_data" USING btree ("_order");
  CREATE INDEX "_stall_form_submissions_v_version_submission_data_parent_id_idx" ON "_stall_form_submissions_v_version_submission_data" USING btree ("_parent_id");
  CREATE INDEX "_stall_form_submissions_v_parent_idx" ON "_stall_form_submissions_v" USING btree ("parent_id");
  CREATE INDEX "_stall_form_submissions_v_version_version_tenant_idx" ON "_stall_form_submissions_v" USING btree ("version_tenant_id");
  CREATE INDEX "_stall_form_submissions_v_version_version_site_idx" ON "_stall_form_submissions_v" USING btree ("version_site_id");
  CREATE INDEX "_stall_form_submissions_v_version_version_form_idx" ON "_stall_form_submissions_v" USING btree ("version_form_id");
  CREATE INDEX "_stall_form_submissions_v_version_version_updated_at_idx" ON "_stall_form_submissions_v" USING btree ("version_updated_at");
  CREATE INDEX "_stall_form_submissions_v_version_version_created_at_idx" ON "_stall_form_submissions_v" USING btree ("version_created_at");
  CREATE INDEX "_stall_form_submissions_v_created_at_idx" ON "_stall_form_submissions_v" USING btree ("created_at");
  CREATE INDEX "_stall_form_submissions_v_updated_at_idx" ON "_stall_form_submissions_v" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_until_idx" ON "payload_jobs" USING btree ("processing_until");
  CREATE INDEX "payload_jobs_concurrency_key_idx" ON "payload_jobs" USING btree ("concurrency_key");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_pages_v" ADD CONSTRAINT "_landing_pages_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sites_fk" FOREIGN KEY ("sites_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_integrations_fk" FOREIGN KEY ("integrations_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_clients_fk" FOREIGN KEY ("clients_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_projects_fk" FOREIGN KEY ("projects_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_website_settings_fk" FOREIGN KEY ("website_settings_id") REFERENCES "public"."website_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stall_pages_fk" FOREIGN KEY ("stall_pages_id") REFERENCES "public"."stall_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stall_settings_fk" FOREIGN KEY ("stall_settings_id") REFERENCES "public"."stall_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stall_header_fk" FOREIGN KEY ("stall_header_id") REFERENCES "public"."stall_header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stall_footer_fk" FOREIGN KEY ("stall_footer_id") REFERENCES "public"."stall_footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stall_redirects_fk" FOREIGN KEY ("stall_redirects_id") REFERENCES "public"."stall_redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stall_forms_fk" FOREIGN KEY ("stall_forms_id") REFERENCES "public"."stall_forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_stall_form_submissions_fk" FOREIGN KEY ("stall_form_submissions_id") REFERENCES "public"."stall_form_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_integrations_fk" FOREIGN KEY ("integrations_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "landing_pages_site_idx" ON "landing_pages" USING btree ("site_id");
  CREATE INDEX "_landing_pages_v_version_version_site_idx" ON "_landing_pages_v" USING btree ("version_site_id");
  CREATE INDEX "payload_locked_documents_rels_sites_id_idx" ON "payload_locked_documents_rels" USING btree ("sites_id");
  CREATE INDEX "payload_locked_documents_rels_integrations_id_idx" ON "payload_locked_documents_rels" USING btree ("integrations_id");
  CREATE INDEX "payload_locked_documents_rels_clients_id_idx" ON "payload_locked_documents_rels" USING btree ("clients_id");
  CREATE INDEX "payload_locked_documents_rels_projects_id_idx" ON "payload_locked_documents_rels" USING btree ("projects_id");
  CREATE INDEX "payload_locked_documents_rels_website_settings_id_idx" ON "payload_locked_documents_rels" USING btree ("website_settings_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_stall_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("stall_pages_id");
  CREATE INDEX "payload_locked_documents_rels_stall_settings_id_idx" ON "payload_locked_documents_rels" USING btree ("stall_settings_id");
  CREATE INDEX "payload_locked_documents_rels_stall_header_id_idx" ON "payload_locked_documents_rels" USING btree ("stall_header_id");
  CREATE INDEX "payload_locked_documents_rels_stall_footer_id_idx" ON "payload_locked_documents_rels" USING btree ("stall_footer_id");
  CREATE INDEX "payload_locked_documents_rels_stall_redirects_id_idx" ON "payload_locked_documents_rels" USING btree ("stall_redirects_id");
  CREATE INDEX "payload_locked_documents_rels_stall_forms_id_idx" ON "payload_locked_documents_rels" USING btree ("stall_forms_id");
  CREATE INDEX "payload_locked_documents_rels_stall_form_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("stall_form_submissions_id");
  CREATE INDEX "payload_preferences_rels_integrations_id_idx" ON "payload_preferences_rels" USING btree ("integrations_id");
  CREATE INDEX "landing_pages_tenant_idx" ON "landing_pages" USING btree ("tenant_id");`)
}

export async function down(): Promise<void> {
  throw new Error('Restore the pre-unified database snapshot for rollback; destructive down migration is intentionally disabled.');
}
