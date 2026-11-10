'use client'
import { useCartStore, type CartItem } from '@/lib/cart'
import { supportsSterilization, sterilizationChoiceLabel, STERILIZATION_GUIDANCE } from '@/lib/commerce'
export default function CartSterilizationChoice({item}:{item:CartItem}) {
 const enabled=useCartStore(state=>state.commercePolicy.preparation_options)
 const fee=useCartStore(state=>state.commercePolicy.sterilization_fee) || 0
 const allProducts=useCartStore(state=>state.commercePolicy.sterilization_all_products)
 const setSterilized=useCartStore(state=>state.setSterilized)
 if(!enabled || ![5,10].includes(fee || 0) || !supportsSterilization(item,allProducts)) return null
 return <label className="mt-3 block text-xs leading-6 text-store-muted">Deseja a peça já esterilizada?<select value={item.sterilized===true?'yes':'no'} onChange={event=>setSterilized(item.variantKey,event.target.value==='yes')} className="mt-1 block min-h-[44px] w-full rounded-xl border border-store-border bg-store-surface px-3 text-xs"><option value="no">Não</option><option value="yes">{sterilizationChoiceLabel(fee)}</option></select><span className="mt-1 block text-[11px] leading-5 text-store-muted">{STERILIZATION_GUIDANCE}</span></label>
}
