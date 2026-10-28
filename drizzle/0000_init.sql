CREATE TABLE "activations" (
	"id" text PRIMARY KEY NOT NULL,
	"license_id" text NOT NULL,
	"fingerprint_version" integer NOT NULL,
	"machine_ids" jsonb NOT NULL,
	"machine_name" text NOT NULL,
	"windows_version" text,
	"app_version" text,
	"installation_id" text,
	"method" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reset_at" timestamp with time zone,
	"reset_by" text,
	"reset_reason" text,
	CONSTRAINT "activations_status_check" CHECK ("activations"."status" in ('active', 'reset')),
	CONSTRAINT "activations_method_check" CHECK ("activations"."method" in ('online', 'offline'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"country" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"actor" text,
	"ip" text,
	"license_id" text,
	"activation_id" text,
	"customer_id" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_ciphertext" text NOT NULL,
	"key_hint" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"max_activations" integer DEFAULT 1 NOT NULL,
	"kind" text DEFAULT 'perpetual' NOT NULL,
	"reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licenses_key_hash_unique" UNIQUE("key_hash"),
	CONSTRAINT "licenses_status_check" CHECK ("licenses"."status" in ('active', 'suspended', 'revoked')),
	CONSTRAINT "licenses_max_activations_check" CHECK ("licenses"."max_activations" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code"),
	CONSTRAINT "products_key_prefix_unique" UNIQUE("key_prefix")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failed_sign_ins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"last_sign_in_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('pending', 'active', 'disabled')),
	CONSTRAINT "users_role_check" CHECK ("users"."role" is null or "users"."role" in ('admin', 'support', 'viewer')),
	CONSTRAINT "users_active_role_check" CHECK ("users"."status" <> 'active' or "users"."role" is not null)
);
--> statement-breakpoint
ALTER TABLE "activations" ADD CONSTRAINT "activations_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activations_license_idx" ON "activations" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "events_at_idx" ON "events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "events_license_idx" ON "events" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "licenses_customer_idx" ON "licenses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "licenses_product_idx" ON "licenses" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");