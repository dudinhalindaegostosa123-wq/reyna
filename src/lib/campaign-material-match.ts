interface MaterialProduct {material?:string|null;name?:string|null;tags?:string[]|null}
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const titanium=/(?:\btitanio\b|\btitanium\b|\bastm\s*f?\s*136\b)/
const coating=/(?:revestid|banhad|folhead|dourad|\bpvd\b|\bgold\b|\bouro\b)/
export function isNaturalTitaniumMaterial(material:string){
 const value=normalize(material)
 return titanium.test(value) && !coating.test(value)
}
export function matchesCampaignMaterial(product:MaterialProduct,selected:string):boolean {
 const material=normalize(product.material || '')
 const choice=normalize(selected)
 if(material===choice && !isNaturalTitaniumMaterial(selected))return true
 // An explicit different material must not be overridden by an old titanium tag.
 if(/(?:bio[ -]*flex|\bouro\b|\bgold\b|\baco\b|\bsteel\b|\bprata\b|\bsilver\b|\bniobio\b)/.test(material) && !titanium.test(material))return false
 const text=normalize([material,product.name || '',...(product.tags || [])].join(' '))
 if(isNaturalTitaniumMaterial(selected))return titanium.test(text) && !coating.test(text)
 // Gold-coated titanium aliases are equivalent; black PVD and solid gold are separate.
 const goldCoated=(value:string)=>titanium.test(value) && coating.test(value) && /(?:ouro|\bgold\b|dourad)/.test(value) && !/\b(?:black|pret[oa])\b/.test(value)
 return goldCoated(choice) && goldCoated(text)
}
