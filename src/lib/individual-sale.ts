import type {ImportedVariation} from './data'
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
export function isIndividualSale(product:{name:string;originalName?:string;category?:string;categorySlugs?:string[];categories?:string[];category_slugs?:string[]}){
 const text=[product.originalName || product.name,product.category || '',...(product.categorySlugs || product.category_slugs || []),...(product.categories || [])].join(' ')
 return !/after.?care|soro|limpeza|higieni|pin[cç]a|porta.?joia|estojo|mostru[aá]rio|expositor|luvas?|alicate|instrumental|autoclave|agulha|cateter/i.test(text) && /(?:^|[^a-z0-9])(?:push[\s_-]*pin|threadless|mamilos?|nipples?)(?=$|[^a-z0-9])/i.test(text)
}
function packagingKey(key:string){const value=normalize(key);return /quantidade|apresentacao|unidadedevenda|vendapor|quantity|packaging/.test(value) && !/pedra|cristal|navete|esfera|pontos/.test(value)}
export function salePresentation(attributes:unknown):'unit'|'pair'|null{
 if(!attributes || typeof attributes!=='object' || Array.isArray(attributes))return null
 let found:'unit'|'pair'|null=null
 for(const [key,value] of Object.entries(attributes)){
  if(!packagingKey(key) || typeof value!=='string')continue
  const text=normalize(value),kind=['unidade','unitario','unitaria','1unidade','individual','unit'].includes(text)?'unit':['par','pares','pair','2unidades','2pecas'].includes(text)?'pair':null
  if(!kind || found && found!==kind)return null
  found=kind
 }
 return found
}
export function unitTitle(value:string){return value.replace(/\bpar\s+(?:de\s+)?(?=(?:piercings?|joias?|mamilos?|nipples?|push[\s-]*pin)\b)/gi,'')}
export function individualVariations(variations:ImportedVariation[]){
 return variations.filter(variation=>salePresentation(variation.attributes)!=='pair').map(variation=>{
  if(salePresentation(variation.attributes)!=='unit')return variation
  const attributes=Object.fromEntries(Object.entries(variation.attributes || {}).filter(([key])=>!packagingKey(key)))
  const name=Object.entries(attributes).map(([key,value])=>`${key} ${value}`).join(' / ') || 'Unidade'
  return {...variation,attributes,name}
 })
}
