export interface LabelPurchaseView {
  orderId: string
  phase: string
  reviewId: string
  reviewCents: number | null
  paidCents: number | null
  expires: string
  carrierStatus: string
  issues: string[]
}
