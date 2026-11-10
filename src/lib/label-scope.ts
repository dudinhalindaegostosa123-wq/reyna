export type LabelScope = 'current' | 'legacy'
export const LEGACY_LABEL_TABLES: Record<string, string> = {
  serenity_orders: 'serenity_legacy_shipping_orders_v1',
  serenity_label_drafts: 'serenity_legacy_label_drafts_v1',
  serenity_label_jobs: 'serenity_legacy_label_jobs_v1',
  serenity_label_purchases: 'serenity_legacy_label_purchases_v1',
}
export const LEGACY_LABEL_RPCS = [
  'serenity_label_save_draft', 'serenity_label_job_quote', 'serenity_label_job_claim', 'serenity_label_job_finish',
  'serenity_label_purchase_review', 'serenity_label_purchase_observe', 'serenity_label_purchase_claim', 'serenity_label_purchase_note',
]
