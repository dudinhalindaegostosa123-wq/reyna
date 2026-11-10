CREATE TABLE public."products" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "woo_id" bigint,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "product_type" text DEFAULT 'simple'::text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "visibility" text DEFAULT 'visible'::text NOT NULL,
  "sku" text,
  "short_description" text DEFAULT ''::text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "material" text DEFAULT ''::text NOT NULL,
  "categories" text[] DEFAULT '{}'::text[] NOT NULL,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "regular_price" numeric(12,2),
  "sale_price" numeric(12,2),
  "sale_starts_at" timestamp with time zone,
  "sale_ends_at" timestamp with time zone,
  "stock_status" text DEFAULT 'outofstock'::text NOT NULL,
  "stock_quantity" integer,
  "backorders" text DEFAULT 'no'::text NOT NULL,
  "sold_individually" boolean DEFAULT false NOT NULL,
  "weight_g" numeric(12,3),
  "dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "featured" boolean DEFAULT false NOT NULL,
  "seo_title" text,
  "seo_description" text,
  "related_woo_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."product_variants" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "woo_id" bigint,
  "name" text DEFAULT ''::text NOT NULL,
  "sku" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "regular_price" numeric(12,2),
  "sale_price" numeric(12,2),
  "sale_starts_at" timestamp with time zone,
  "sale_ends_at" timestamp with time zone,
  "stock_status" text DEFAULT 'outofstock'::text NOT NULL,
  "stock_quantity" integer,
  "backorders" text DEFAULT 'no'::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."product_media" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "variant_id" uuid,
  "media_type" text NOT NULL,
  "storage_path" text,
  "youtube_id" text,
  "alt_text" text DEFAULT ''::text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source_url" text,
  "original_path" text,
  "thumbnail_path" text
);
ALTER TABLE public."products" ADD CONSTRAINT "products_stock_quantity_check" CHECK ((stock_quantity >= 0));
ALTER TABLE public."products" ADD CONSTRAINT "products_backorders_check" CHECK ((backorders = ANY (ARRAY['no'::text, 'notify'::text, 'yes'::text])));
ALTER TABLE public."products" ADD CONSTRAINT "products_weight_g_check" CHECK ((weight_g >= (0)::numeric));
ALTER TABLE public."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);
ALTER TABLE public."products" ADD CONSTRAINT "products_woo_id_key" UNIQUE (woo_id);
ALTER TABLE public."products" ADD CONSTRAINT "products_slug_key" UNIQUE (slug);
ALTER TABLE public."products" ADD CONSTRAINT "products_product_type_check" CHECK ((product_type = ANY (ARRAY['simple'::text, 'variable'::text, 'grouped'::text, 'external'::text])));
ALTER TABLE public."products" ADD CONSTRAINT "products_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public."products" ADD CONSTRAINT "products_visibility_check" CHECK ((visibility = ANY (ARRAY['visible'::text, 'catalog'::text, 'search'::text, 'hidden'::text])));
ALTER TABLE public."products" ADD CONSTRAINT "products_attributes_check" CHECK ((jsonb_typeof(attributes) = 'array'::text));
ALTER TABLE public."products" ADD CONSTRAINT "products_regular_price_check" CHECK ((regular_price >= (0)::numeric));
ALTER TABLE public."products" ADD CONSTRAINT "products_sale_price_check" CHECK ((sale_price >= (0)::numeric));
ALTER TABLE public."products" ADD CONSTRAINT "products_stock_status_check" CHECK ((stock_status = ANY (ARRAY['instock'::text, 'outofstock'::text, 'onbackorder'::text])));
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_attributes_check" CHECK ((jsonb_typeof(attributes) = 'object'::text));
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_regular_price_check" CHECK ((regular_price >= (0)::numeric));
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_sale_price_check" CHECK ((sale_price >= (0)::numeric));
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_stock_status_check" CHECK ((stock_status = ANY (ARRAY['instock'::text, 'outofstock'::text, 'onbackorder'::text])));
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_stock_quantity_check" CHECK ((stock_quantity >= 0));
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_backorders_check" CHECK ((backorders = ANY (ARRAY['no'::text, 'notify'::text, 'yes'::text])));
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_pkey" PRIMARY KEY (id);
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_woo_id_key" UNIQUE (woo_id);
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_id_product_id_key" UNIQUE (id, product_id);
ALTER TABLE public."product_media" ADD CONSTRAINT "product_media_media_type_check" CHECK ((media_type = ANY (ARRAY['image'::text, 'youtube'::text])));
ALTER TABLE public."product_media" ADD CONSTRAINT "product_media_check" CHECK ((((media_type = 'image'::text) AND (storage_path IS NOT NULL) AND (length(storage_path) > 0) AND (youtube_id IS NULL)) OR ((media_type = 'youtube'::text) AND (youtube_id IS NOT NULL) AND (youtube_id ~ '^[A-Za-z0-9_-]{11}$'::text) AND (storage_path IS NULL))));
ALTER TABLE public."product_media" ADD CONSTRAINT "product_media_pkey" PRIMARY KEY (id);
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."product_media" ADD CONSTRAINT "product_media_variant_id_product_id_fkey" FOREIGN KEY (variant_id, product_id) REFERENCES product_variants(id, product_id) ON DELETE CASCADE;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.products TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.product_media TO service_role;
CREATE OR REPLACE FUNCTION public.serenity_normalize(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  select translate(
    lower(coalesce(value, '')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñ',
    'aaaaaaeeeeiiiiooooouuuucn'
  );
$function$
;