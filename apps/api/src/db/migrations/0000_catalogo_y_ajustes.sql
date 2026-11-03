CREATE TYPE "public"."category_kind" AS ENUM('regular', 'build_pizza');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "category_kind" DEFAULT 'regular' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"fee" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "delivery_zones_fee_check" CHECK ("delivery_zones"."fee" BETWEEN 0 AND 1000000)
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ingredients_price_check" CHECK ("ingredients"."price" BETWEEN 0 AND 1000000)
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"label" text NOT NULL,
	"price" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_variants_price_check" CHECK ("product_variants"."price" BETWEEN 0 AND 1000000)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"image_url" text,
	"available" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "products_price_check" CHECK ("products"."price" BETWEEN 0 AND 1000000)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"business_name" text NOT NULL,
	"whatsapp_number" text NOT NULL,
	"pickup_address" text,
	"opening_hours" jsonb,
	"timezone" text DEFAULT 'America/Santiago' NOT NULL,
	"orders_paused" boolean DEFAULT false NOT NULL,
	"build_pizza_base_price" integer NOT NULL,
	"build_pizza_promo_price" integer NOT NULL,
	"build_pizza_promo_included" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_whatsapp_number_check" CHECK ("settings"."whatsapp_number" ~ '^56[0-9]{9}$'),
	CONSTRAINT "settings_build_pizza_prices_check" CHECK ("settings"."build_pizza_base_price" BETWEEN 0 AND 1000000 AND "settings"."build_pizza_promo_price" BETWEEN 0 AND 1000000),
	CONSTRAINT "settings_build_pizza_promo_included_check" CHECK ("settings"."build_pizza_promo_included" BETWEEN 0 AND 30)
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");