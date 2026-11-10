export interface CommercePolicy { stem_fee?:number; preparation_options?:boolean; sterilization_all_products?:boolean; sterilization_fee?:number; version:number; anodization_fee:number; included_stems:boolean; retail_free_shipping_minimum_cents:number|null; free_shipping_after_discounts:boolean }
export const DEFAULT_COMMERCE_POLICY:CommercePolicy={version:0,anodization_fee:15,included_stems:false,retail_free_shipping_minimum_cents:null,free_shipping_after_discounts:true}
export const STEM_LENGTHS=['4','6','8','10'] as const
export const STEM_LABELS:Record<StemLength,string> = { '4':'4 mm (super curta)', '6':'6 mm (perfuração cicatrizada/downsize)', '8':'8 mm (perfuração nova)', '10':'10 mm (comprida)' }
export type StemLength=typeof STEM_LENGTHS[number]
export function isStem(value:unknown):value is StemLength { return typeof value==='string' && STEM_LENGTHS.some(length=>length===value) }
export function isTopProduct(product:{name:string;originalName?:string;categorySlugs?:string[];category_slugs?:string[]}) {
  if(/after.?care|soro|limpeza|higieni|pin[cç]a|porta.?joia|estojo|mostru[aá]rio|expositor|luvas?|alicate|instrumental|autoclave|esteriliz|agulha|cateter/i.test(product.name)) return false
  return /\btopos?\b/i.test(product.originalName || product.name) || (product.categorySlugs || product.category_slugs || []).some(slug=>slug==='topo' || slug==='topos')
}

export function existingVariantStem(attributes:unknown):StemLength|undefined {
  if(!attributes || typeof attributes!=='object' || Array.isArray(attributes)) return undefined
  for(const [key,value] of Object.entries(attributes)) {
    if(!/comprimento/i.test(key) || /pedra|topo|cristal|zirc/i.test(key) || typeof value!=='string') continue
    const match=/^\s*(4|6|8|10)(?:[.,]0)?\s*mm\s*$/i.exec(value)
    if(match && isStem(match[1])) return match[1]
  }
  return undefined
}

export function isMicrodermalProduct(product:{name:string}) {
  return /microdermal/i.test(product.name)
}
export function isMicrodermalTop(product:{name:string}) {
  return /\b(?:topos?|labrets?)\b/i.test(product.name) && isMicrodermalProduct(product) && !/base\s+microdermal/i.test(product.name)
}
export function supportsSterilization(product:{name:string;material?:string},allProducts=false) {
  if(allProducts) return true
  return !/after.?care|soro|limpeza|higieni|pin[cç]a|porta.?joia|estojo|mostru[aá]rio|expositor|luvas?|alicate|instrumental|autoclave|esteriliz|agulha|cateter/i.test(product.name)
}

export const STERILIZATION_GUIDANCE = "Receba sua joia esterilizada, pronta para ser utilizada em uma perfuração realizada por um profissional."
export function sterilizationChoiceLabel(fee:number) { return fee > 0 ? `Sim — + ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(fee)} por peça` : 'Sim' }
