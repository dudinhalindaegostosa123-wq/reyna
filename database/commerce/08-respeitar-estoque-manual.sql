-- Preserve explicit stock edits instead of forcing every published item into stock.
-- Existing quantities/statuses and all payment/stock-validation functions stay intact.
begin;
drop trigger if exists serenity_unlimited_stock_v1 on public.products;
drop trigger if exists serenity_unlimited_stock_v1 on public.product_variants;
notify pgrst,'reload schema';
commit;
