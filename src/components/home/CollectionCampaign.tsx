import Link from 'next/link'
import { COLLECTION_TIERS } from '@/lib/collection-progress'
import { pixDiscountEnabled } from '@/lib/pix-discount-server'
import { CircleCheck } from 'lucide-react'

export default async function CollectionCampaign() {
  const pix = await pixDiscountEnabled()
  return (
    <section aria-labelledby="collection-title" className="bg-[#FAFAF8] px-4 py-5 sm:px-8 sm:py-7">
      <div className="mx-auto max-w-7xl rounded-[24px] bg-[#F2EFE9] px-4 py-8 text-center sm:px-8 sm:py-11 md:px-12">
        <p className="text-[10px] uppercase tracking-[0.1em] text-[#81796C] sm:text-xs">
          Serenity Piercings · Benefício exclusivo
        </p>
        <h2 id="collection-title" className="mt-4 text-[26px] font-normal leading-tight tracking-tight sm:text-[34px] md:text-[38px]">
          Quanto mais joias, maior o desconto.
        </h2>
        <p className="mx-auto mt-4 max-w-4xl text-[13px] leading-relaxed text-[#756B5D] sm:text-base">
          Desconto progressivo nas joias elegíveis. Ouro 18K e Bioflex não participam. Escolha suas favoritas e economize mais a cada peça adicionada ao carrinho.
        </p>
        <div className="mx-auto mt-7 grid max-w-5xl grid-cols-2 gap-2 sm:mt-8 sm:grid-cols-4 sm:gap-4">
          {COLLECTION_TIERS.map(tier => (
            <div key={tier.quantity} className="border border-[#CEC5BA] px-1 py-4 sm:px-4 sm:py-5">
              <p className="text-[9px] uppercase tracking-[0.06em] text-[#756B5D] sm:text-xs">{tier.quantity === 5 ? '5 ou mais' : `${tier.quantity} joias`}</p>
              <p className="mt-2 whitespace-nowrap text-[17px] font-medium leading-tight text-[#292621] sm:text-[28px] md:text-[32px]">{tier.percent}% OFF</p>
            </div>
          ))}
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-[12px] leading-relaxed text-[#756B5D] sm:text-sm">
          <CircleCheck size={17} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
          <span>{pix ? 'Acumulável com cupom e mais 5% OFF no Pix.' : 'Acumulável com cupom.'}</span>
        </p>
        <Link href="/categoria/todos" className="mt-5 inline-flex min-h-[50px] w-full max-w-sm items-center justify-center gap-3 rounded-[7px] bg-[#343029] px-5 py-4 text-[12px] uppercase tracking-[0.06em] text-white transition-colors hover:bg-[#4A443C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#947B57] sm:text-sm">
          Escolher minhas joias <span aria-hidden="true">↗</span>
        </Link>
        <p className="mt-3 text-[10px] text-[#81796C]">Sem valor mínimo de compra. Benefício em joias elegíveis.</p>
      </div>
    </section>
  )
}
