-- Executar no SQL Editor do Supabase NOVO.
-- Indices para as consultas correlacionadas da store_catalog.
-- Pode repetir; nao altera cadastros, precos, estoque ou arquivos.

CREATE INDEX IF NOT EXISTS lunarity_variants_enabled_product_idx
  ON public.product_variants (product_id)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS lunarity_media_product_cover_idx
  ON public.product_media (product_id, (variant_id IS NOT NULL), position, id)
  WHERE media_type = 'image';

CREATE INDEX IF NOT EXISTS lunarity_promotion_product_variant_idx
  ON public.serenity_promotion_items (product_id, variant_id);

ANALYZE public.products;
ANALYZE public.product_variants;
ANALYZE public.product_media;
ANALYZE public.serenity_promotion_items;
