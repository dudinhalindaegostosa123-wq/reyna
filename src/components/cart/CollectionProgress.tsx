import type { CouponCheckoutQuote } from '@/app/checkout/actions'
import { formatPrice } from '@/lib/data'
import { collectionProgressMessage, COLLECTION_MAX_QUANTITY, COLLECTION_TIERS } from '@/lib/collection-progress'

export default function CollectionProgress({ quote, compact = false }: { quote: CouponCheckoutQuote | null; compact?: boolean }) {
  const campaign = quote?.progressive
  if (!campaign || quote?.pricing_mode === 'wholesale') return null
  const quantity = campaign.quantity
  if (compact) return <aside aria-label="Desconto progressivo" className="rounded-2xl border border-store-border bg-store-canvas px-5 py-6 text-center text-store-text sm:px-8 sm:py-8">
    <p className="text-xs font-medium uppercase tracking-[0.12em] text-store-muted">Desconto progressivo nas suas joias</p>
    <div className="mx-auto my-4 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">{COLLECTION_TIERS.map(tier=><div key={tier.quantity} className={`rounded-xl border p-3 ${quantity>=tier.quantity?'border-[#947B57] bg-store-surface':'border-store-border'}`}><p className="text-xs">{tier.quantity===5?'5 ou mais':tier.quantity} joias</p><p className="mt-1 text-xl font-semibold sm:text-2xl">{tier.percent}% OFF</p></div>)}</div>
    <p role="status" aria-live="polite" className="mx-auto max-w-2xl text-base font-medium leading-7 sm:text-xl">{collectionProgressMessage(quantity)}</p>
    {campaign.discount_cents>0 && <p className="mt-3 text-sm">Você economizou <strong>{formatPrice(campaign.discount_cents/100)}</strong> com o progressivo.</p>}
    <p className="mt-3 text-xs leading-5 text-store-muted">Ouro 18K e Bioflex não participam. O benefício vale apenas para as joias elegíveis.</p>
  </aside>
  return <div className="rounded-2xl border border-store-border bg-store-canvas p-4">
    <p className="text-[10px] uppercase tracking-[0.15em] text-store-accent">Serenity Collection</p>
    <p className="mt-2 text-sm">{campaign.percent ? `Sua seleção tem ${campaign.percent}% de desconto progressivo.` : 'Sua próxima escolha pode tornar a seleção mais especial.'}</p>
    <div role="progressbar" aria-label="Joias para o benefício máximo" aria-valuenow={Math.min(quantity, COLLECTION_MAX_QUANTITY)} aria-valuemin={0} aria-valuemax={COLLECTION_MAX_QUANTITY} className="mt-3 h-1 overflow-hidden rounded-full bg-store-raised"><div style={{ width: `${Math.min(quantity / COLLECTION_MAX_QUANTITY, 1) * 100}%` }} className="h-full rounded-full bg-[#947B57]" /></div>
    <p className="mt-3 text-xs leading-5 text-store-muted">{collectionProgressMessage(quantity)}</p>
    {campaign.discount_cents > 0 && <p className="mt-2 text-xs text-store-accent">Economia progressiva: {formatPrice(campaign.discount_cents / 100)}</p>}
    <p className="mt-2 text-[10px] leading-4 text-store-muted">Ouro 18K e Bioflex não contam para as faixas e não recebem desconto progressivo. Cupons podem ser usados no checkout. Frete, esterilização, anodização e produtos de cuidados não entram no benefício.</p>
  </div>
}
