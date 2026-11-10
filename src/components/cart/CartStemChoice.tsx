'use client'
import StemChoice from '@/components/product/StemChoice'
import { useCartStore,type CartItem } from '@/lib/cart'
export default function CartStemChoice({item}:{item:CartItem}) {
  const fee=useCartStore(state=>state.commercePolicy.stem_fee) || 5
  const setStem=useCartStore(state=>state.setStem)
  return item.requiresStem && !item.stemLocked?<StemChoice fee={fee} value={item.stem || ''} onChange={value=>setStem(item.variantKey,value)} />:null
}
