// Update the coating specification without rewriting URLs or solid-gold labels.
export function coatedGoldCopy(value:string,coatedContext=false):string {
 const normalized=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 const coated=coatedContext || (/titanio|titanium/.test(normalized) && /revestid|banhad|folhead|pvd/.test(normalized) && /ouro|gold|dourad/.test(normalized))
 return value.split(/(<[^>]*>|https?:\/\/[^\s<]+)/g).map(part=>{
  if(part.startsWith('<') || /^https?:\/\//i.test(part))return part
  let result=part.replace(/((?:tit[aâ]nio|titanium)\s+(?:revestid[oa]|banhad[oa]|folhead[oa])(?:\s+(?:de|em|com|a|à))?\s+ouro\s*)18\s*k\b/gi,(_,prefix:string)=>prefix+'24K')
  if(coated)result=result.replace(/(^|\s)(ouro\s*)18\s*k\b(?!\s*maci[cç]o)/gi,(_,space:string,gold:string)=>space+gold+'24K')
  return result
 }).join('')
}

// Aplicado ao texto visível e ao resumo de SEO quando a política inclui haste.
export function rewriteStemDescription(value:string,fee=0):string {
  const result = labretCopy(value
    .replace(/\b(?:por\s+)?n[aã]o\s+acompanhar\s+(?:a\s+)?haste(?:\s+base)?/gi,'Por acompanhar uma haste incluída')
    .replace(/\b(?:apenas|somente)\s+(?:o\s+)?(?:topo|labret)\b/gi,'topo com haste incluída')
    .replace(/\b(haste[^.!?\n]{0,100})adquirid[ao]\s+separadamente/gi,'$1incluída')
    .replace(/\bhaste(?:\s+labret)?\s*\(\s*(?:vendid[ao]|comercializad[ao])\s+(?:[àa]\s+parte|separadamente)\s*\)/gi,'Haste incluída, sem custo adicional')
    .replace(/\bhaste(?:\s+labret)?\s*,\s*(?:vendid[ao]|comercializad[ao])\s+(?:[àa]\s+parte|separadamente)/gi,'Haste incluída, sem custo adicional')
    .replace(/\b(?:a\s+)?haste(?:s)?(?:\s+(?:base|estrutural|labret|padr[aã]o|do\s+labret))?(?:\s*\([^)]{0,80}\))?\s*(?:[ée]\s+)?(?:n[aã]o\s+(?:est[aá]\s+)?(?:inclus[ao]s?|inclu[ií]d[ao]s?)|(?:vendid[ao]s?|comercializad[ao]s?)\s+(?:[àa]\s+parte|separadamente))(?:\s+e\s+(?:deve|precisa)\s+ser\s+adicionad[ao]\s+separadamente\s+ao\s+carrinho)?/gi,'Haste incluída, sem custo adicional')
    .replace(/\bn[aã]o\s+(?:acompanha|inclui|inclu[ií])\s+(?:a\s+)?haste(?:s)?/gi,'acompanha haste incluída')
    .replace(/\bsem\s+haste(?:s)?\b/gi,'com haste incluída')
    .replace(/\b(?:a\s+)?venda\s+(?:[ée]\s+)?exclusiva\s+(?:do|deste)\s+(?:topo|labret)\b/gi,'Venda do topo com haste incluída')
    .replace(/\b(?:topo|labret)\s+avulso\b/gi,'labret com haste incluída'))
  return result.replace(/(?:uma )?haste(?: incluída)?(?:,? sem custo adicional)|haste incluída/gi, 'haste opcional (+ R$ 5,00 por peça)')
}

// Change customer-facing words while preserving HTML attributes and old URLs.
export function labretCopy(value: string): string {
  return coatedGoldCopy(value).split(/(<[^>]*>)/g).map(part => part.startsWith('<') ? part :
    part.replace(/\btopos?\b/gi, word => {
      const replacement = /s$/i.test(word) ? 'labrets' : 'labret'
      return word === word.toUpperCase() ? replacement.toUpperCase() :
        /^[A-Z]/.test(word) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement
    })
  ).join('')
}
