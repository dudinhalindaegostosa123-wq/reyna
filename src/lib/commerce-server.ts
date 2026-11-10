import 'server-only'
import { cache } from 'react'
import { DEFAULT_COMMERCE_POLICY,type CommercePolicy } from './commerce'
export const getCommercePolicy=cache(async():Promise<CommercePolicy>=>{
  const url=process.env.SUPABASE_URL?.trim().replace(/\/$/,''),key=process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
  if(!url || !key) return DEFAULT_COMMERCE_POLICY
  try{
    const response=await fetch(`${url}/rest/v1/serenity_commerce_settings_v1?select=*&singleton=eq.true`,{headers:{apikey:key},cache:'no-store',signal:AbortSignal.timeout(5000)})
    if(!response.ok) return DEFAULT_COMMERCE_POLICY
    const rows=await response.json(),row=Array.isArray(rows)?rows[0]:null
    if(!row || !Number.isSafeInteger(row.version) || row.version<1 || ![0,15].includes(Number(row.anodization_fee)) || !Number.isSafeInteger(row.retail_free_shipping_minimum_cents) || row.retail_free_shipping_minimum_cents<0 || typeof row.included_stems!=='boolean' || typeof row.free_shipping_after_discounts!=='boolean') return DEFAULT_COMMERCE_POLICY
    return {...row,preparation_options:row.preparation_options===true,sterilization_all_products:row.sterilization_all_products===true,stem_fee:Number(row.stem_fee)===5?5:0,sterilization_fee:[5,10].includes(Number(row.sterilization_fee))?Number(row.sterilization_fee):0,anodization_fee:Number(row.anodization_fee)}
  }catch{return DEFAULT_COMMERCE_POLICY}
})
