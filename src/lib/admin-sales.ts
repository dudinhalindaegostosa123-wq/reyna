export interface Customer { id: string; name: string; email: string; phone: string; notes: string }
export interface SaleOption { product_id: string; variant_id: string; name: string; price: number | null; anodizable: boolean; includes_stem?:boolean;stem_length?:string }
export interface SaleLine extends SaleOption { quantity: string; unit_price: string; color: string; stem?:string }
export interface OrderItem { stem_fee?:number; sterilization_fee?: number; stem_length_mm?: string | number | null; sterilized?: boolean | null; name: string; variation: string | null; sku: string | null; quantity: number; unit_price: number; unit_cost: number | null; supplier: string | null; anodization: string | null; voltage: string | null; anodization_fee: number }
export interface Order { source?:string; shipping_pending?:boolean; delivery_address?:Record<string,string>|null; id: string; number: number; status: string; created_at: string; paid_at: string | null; customer_snapshot: { name: string; email: string; phone: string }; items: OrderItem[]; subtotal: number; discount: number; shipping: number; expenses: number; total: number; cost: number | null; missing_costs: number; notes: string }
export interface SalesSummary { paid: number; revenue: number; shipping: number; cost: number; expenses: number; missing: number; margin: number | null; pending: number; customers: number; days: { day: string; total: number }[] }
export const saleMoney = (n: number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n)
export const saleDate = (date: string) => new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(date))
export const SALE_STATUS: Record<string,string> = { pending:'Pendente',paid:'Pago',cancelled:'Cancelado',refunded:'Estornado integralmente' }
export function saleAmount(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,7}([,.]\d{1,2})?$/.test(value.trim())) throw new Error('Use valores como 157,90, sem ponto de milhar.')
  return Math.round(Number(value.trim().replace(',','.'))*100)/100
}
export const saleUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

// Lunarity: pedidos do site v1
