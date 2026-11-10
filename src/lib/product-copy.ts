import { plainText } from './data'
import { rewriteStemDescription, labretCopy } from './stem-description'
type Source = { name: string; sku?: string; material?: string; description?: string; longDescription?: string; includesStem?: boolean;stemFee?:number }
export interface ProductFact { label: string; value: string }
const clean = (value: string) => plainText(value).replace(/\\t/g, ' ').replace(/\s+/g, ' ').trim()
const key = (value: string) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const valueKey = (value:string) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/(\d),(\d)/g,'$1.$2').replace(/\s+/g,'')
const labels: Record<string,string> = {
 desenho:'Desenho',conteudo:'Conteúdo da compra',fechamento:'Fecho',medidadopingente:'Medida do pingente',dimensoesdapartesuperior:'Dimensões da parte superior', material:'Material',materialbase:'Material',revestimento:'Revestimento',acabamento:'Acabamento',
 mecanismo:'Mecanismo',sistemadeencaixe:'Encaixe',tipodeencaixe:'Encaixe',rosca:'Rosca',tipoderosca:'Tipo de rosca',
 dimensoes:'Dimensões',dimensoesdotopo:'Dimensões do labret',medidadotopo:'Medida do labret',medidasdotopo:'Medidas do labret',
 espessura:'Espessura',espessuradahaste:'Espessura da haste',espessuradapeca:'Espessura da peça',
 comprimentodahaste:'Comprimento da haste',comprimento:'Comprimento',alturadahaste:'Altura da haste',
 diametrointerno:'Diâmetro interno',diametrosinternos:'Diâmetros internos',diametro:'Diâmetro',diametrosdisponiveis:'Diâmetros disponíveis',
 medidas:'Medidas',medidaspeso:'Medidas / peso',peso:'Peso',
 gemas:'Gemas',gema:'Gema',pedras:'Pedras',pedraria:'Pedraria',cor:'Cor',
 sistemadefecho:'Fecho',tipodefecho:'Fecho',sistemadefechamento:'Fecho',sistemadeabertura:'Abertura',abertura:'Abertura',
 venda:'Conteúdo da compra',unidadedevenda:'Conteúdo da compra',quantidade:'Quantidade',
 compatibilidade:'Compatibilidade informada',compatibilidadedehaste:'Compatibilidade da haste',
 }
// Imported descriptions may use spaces, tabs or bold labels instead of colons.
function factLine(value:string):[string,string] | null {
 const text=clean(value), colon=text.indexOf(':')
 if(colon>0 && colon<65)return [text.slice(0,colon),text.slice(colon+1)]
 const match=text.match(/^(Dimensões da parte superior|Dimensões do topo|Medida do pingente|Comprimento da haste|Espessura da haste|Diâmetro interno|Material base|Conteúdo da compra|Tipo de encaixe|Tipo de rosca|Material|Revestimento|Acabamento|Desenho|Pedras|Gemas|Dimensões|Medidas|Fechamento|Conteúdo|Mecanismo|Encaixe|Rosca|Peso|Cor|Venda)\s+(.+)$/i)
 return match ? [match[1],match[2]] : null
}
const risky = /100\s*%\s*(?:segur|biocompat|hipoalerg)|cicatriza|infal[ií]vel|biosseguran[cç]a absoluta|livre de (?:n[ií]quel|rea[cç][oõ]es)|(?:seguran[cç]a|conforto) (?:absolut|garantid)/i
const escape = (value: string) => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
// Read catalogue references without mistaking a metal/standard for a SKU.
const titleReference = /^([a-z]{2,12})\s*(\d{1,8}[a-z]?)(?=\s|[-–—:]|$)/i
const materialPrefixes = /^(?:ouro|titanio|titanium|bioflex|prata|aco|astm|iso|din|abnt|argola|labret|topo|haste|piercing|corrente)$/i
function referencePrefix(name: string) {
 const match = clean(name).match(titleReference)
 return match && !materialPrefixes.test(match[1]) ? match : null
}
export function productReference(name:string,sku?:string) {
 const match = referencePrefix(name)
 return clean(sku || '') || (match ? (match[1]+match[2]).toUpperCase() : '')
}
export function commercialProductName(name: string, sku?: string) {
 const original = clean(name)
 const reference = referencePrefix(original)
 let title = reference ? original.slice(reference[0].length) : original
 // A manually registered SKU may use punctuation or a different reference format.
 if (!reference && clean(sku || '')) {
  const prefix = clean(sku!).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')
  title = title.replace(new RegExp('^'+prefix+'(?=\\s|[-–—:]|$)', 'i'), '')
 }
 return labretCopy(title.replace(/^\s*[-–—:]?\s*/, '')) || labretCopy(original)
}
export function refineProductCopy(product: Source) {
 const source = product.longDescription || ''
 const raw = /<[a-z][^>]*>/i.test(source) ? source : source.split(/\r?\n|\\n/).filter(line=>line.trim()).map(line=>`<p>${escape(line)}</p>`).join('')
 const legacy = /data-path-to-node|robustez arquitet[oô]nica|biosseguran[cç]a absoluta|curadoria.{0,30}dispon[ií]vel|curadoria anat[oô]mica|destaques exclusivos|sin[oô]nimo de alta qualidade|tiragem restrita|precis[aã]o cir[uú]rgica|image_[a-z0-9]+\.(?:png|jpg)|✦/i.test(raw)
 const title = commercialProductName(product.name,product.sku)
 const facts: ProductFact[] = [], review: string[] = []
 const add = (label: string,value: string) => {
  const originalLabel=clean(label).replace(/[:：]$/,'').trim()
  const normalized = labels[key(label)] || (/^(?:espessura|comprimento|diametro|dimens|medida|altura|calibre|encaixe|rosca|fech|mecanic|abertura|haste|cuidados|manutencao|material(?:da|do|estrutural)|metalbase|gemas?|pedras?|cor(?:da|do|es$))/.test(key(label)) ? originalLabel : '')
  if (!normalized) return
  let text = clean(value)
  if (!text || text.length>650) return
  // Retira apelos comerciais, preservando o trecho técnico anterior.
  text = text.replace(/[,;]?\s*\b(?:garantindo|assegurando|promovendo|prevenindo)\b[\s\S]*$/i,'').trim()
  if (risky.test(text)) { if(!review.includes(normalized)) review.push(normalized); return }
  if (product.includesStem && normalized==='Conteúdo da compra') text=rewriteStemDescription(text,product.stemFee || 0)
  if (facts.some(f=>f.label===normalized && valueKey(f.value)===valueKey(text))) return
  if (facts.some(f=>f.label===normalized && valueKey(f.value)!==valueKey(text)) && !review.includes(normalized)) review.push(normalized)
  facts.push({label:normalized,value:text})
 }
 // Tabelas preservam pares de células; listas e parágrafos preservam rótulo e valor.
 for(const match of Array.from(raw.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))) {
  const cells=Array.from(match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(cell=>clean(cell[1]))
  if(cells.length===2) add(cells[0],cells[1])
 }
 for(const match of Array.from(raw.matchAll(/<(?:li|p)\b[^>]*>([\s\S]*?)<\/(?:li|p)>/gi))) {
  const pair=factLine(match[1])
  if(pair)add(...pair)
 }
 // Some imports mix HTML blocks with tab-separated or plain-text specifications.
 for(const line of plainText(raw.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi,'\n').replace(/<(?:p|div|li|section|h[1-6])\b[^>]*>/gi,'\n')).split(/\r?\n/)) {
  const pair=factLine(line)
  if(pair)add(...pair)
 }
 if(facts.length<2) review.push('Ficha técnica incompleta')
 const sourceText=clean(raw)
 if(/garantia\s*(?:de\s*)?(?:vital[ií]cia|\d+\s*(?:dias|meses|anos))/i.test(sourceText)) review.push('Condições específicas de garantia')
 if(/n[aã]o\s+(?:pode|deve)\s+ser\s+(?:esteriliz|autoclav)|n[aã]o\s+autoclav[aá]vel/i.test(sourceText)) review.push('Restrição de esterilização')
 const measures=(text:string)=>Array.from(clean(text).matchAll(/\b(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/gi)).map(match=>String(Number(match[1].replace(',','.')))+match[2].toLowerCase())
 const otherTables=Array.from(raw.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)).map(match=>match[0]).filter(table=>Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)).some(row=>Array.from(row[1].matchAll(/<t[dh]\b/gi)).length>2))
 const factMeasures=measures(facts.map(f=>f.label+': '+f.value).join(' ')+' '+otherTables.join(' '))
 if(measures(raw).some(value=>!factMeasures.includes(value))) review.push('Medidas fora da ficha técnica')
 if(!facts.some(f=>f.label==='Material') && clean(product.material || ''))add('Material',product.material!)
 const factOrder=['Material','Revestimento','Acabamento','Desenho','Mecanismo','Encaixe','Rosca','Tipo de rosca','Fecho','Abertura','Dimensões','Dimensões da parte superior','Diâmetro interno','Diâmetro','Espessura','Espessura da haste','Comprimento da haste','Comprimento','Medida do pingente','Peso','Gemas','Gema','Pedras','Pedraria','Cor','Conteúdo da compra','Quantidade']
 facts.sort((a,b)=>(factOrder.indexOf(a.label)<0?999:factOrder.indexOf(a.label))-(factOrder.indexOf(b.label)<0?999:factOrder.indexOf(b.label)))
 const material = facts.find(f=>f.label==='Material')?.value || clean(product.material || '')
 const kind=/\bbase\b/i.test(title)?'Base':/\b(?:topos?|labrets?)\b/i.test(title)?'Labret':/argola/i.test(title)?'Argola':/brincos?/i.test(title)?'Brinco':/haste/i.test(title)?'Haste':'Peça'
 const gem=facts.find(f=>['Gemas','Gema','Pedras','Pedraria'].includes(f.label))?.value
 const summary = `${material ? `${kind} em ${material.replace(/[.]$/,'')}.` : title+'.'}${gem && !/ausent|sem |n[aã]o|nenhum/i.test(gem)?` Pedraria: ${gem.replace(/[.]$/,'')}.`:''} Confira as medidas e escolha entre as opções disponíveis.`
 const content = product.includesStem ? `Escolha somente o topo ou a joia completa com haste nas opções de compra.${product.stemFee ? ' O adicional da haste é de '+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(product.stemFee)+' por peça.' : ''}` : ''
 // Every catalogue product uses this presentation, including incomplete records.
 const table = (facts.length ? '<table><caption>Ficha técnica</caption><tbody>'+facts.map(f=>`<tr><th>${escape(f.label)}</th><td>${escape(f.value)}</td></tr>`).join('')+'</tbody></table>' : '<h3>Ficha técnica</h3><p>As especificações técnicas ainda não foram informadas no cadastro desta peça.</p>')
 // Keep the store’s prose, care instructions and commercial conditions for ordinary descriptions.
 const narrative = legacy ? '' : raw.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, row => {
  const cells=Array.from(row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(cell=>clean(cell[1]))
  return cells.length===2 && facts.some(f=>f.label===(labels[key(cells[0])] || cells[0])) ? '' : row
 }).replace(/<(li|p)\b[^>]*>([\s\S]*?)<\/\1>/gi, (node,tag,body) => {
  const pair=factLine(body)
  return pair && facts.some(f=>f.label===(labels[key(pair[0])] || clean(pair[0]))) ? '' : node
 }).replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi,(table,body)=> /<tr\b/i.test(body) ? table : '').replace(/<(ul|ol)\b[^>]*>\s*<\/\1>/gi,'')
 // Preserve purchase conditions separately, without keeping the surrounding sales pitch.
 const policies: ProductFact[] = []
 const policy = (label:string,expression:RegExp) => {
  const match=sourceText.match(expression)
  if(match && !policies.some(item=>item.label===label))policies.push({label,value:match[1].trim().replace(/[\s.]+$/,'')+'.'})
 }
 policy('Garantia',/(?:selo de garantia|garantia)\s*:\s*([\s\S]*?)(?=\s*(?:Manutenç[aã]o|Cuidados|🚨|ATENÇ[AÃ]O|✦|$))/i)
 if(!policies.some(item=>item.label==='Garantia'))policy('Garantia',/(garantia\s*(?:de\s*)?(?:vital[ií]cia|\d+\s*(?:dias|meses|anos))[^.!?✦]*[.!?]?)/i)
 policy('Cuidados',/(?:Manutenç[aã]o|Cuidados)\s*:\s*([\s\S]*?)(?=\s*(?:🚨|ATENÇ[AÃ]O|Selo de Garantia|✦|$))/i)
 policy('Trocas',/((?:A troca|Trocas?|Devoluç[aã]o)[^.!?✦]*?(?:lacre[^.!?✦]*|arrependimento[^.!?✦]*|[.!?]))/i)
 policy('Esterilização',/([^.!?✦]*?n[aã]o\s+(?:pode|deve)\s+ser\s+(?:esteriliz|autoclav)[^.!?✦]*|[^.!?✦]*?n[aã]o\s+autoclav[aá]vel[^.!?✦]*)/i)
 const conditions=policies.length ? '<h3>Cuidados e condições da compra</h3><ul>'+policies.map(item=>`<li>${escape(item.label)}: ${escape(item.value)}</li>`).join('')+'</ul>' : '<h3>Cuidados e condições da compra</h3><p>Consulte o atendimento para orientações de cuidados e condições específicas desta peça.</p>'
 const extraMeasures=Array.from(new Set(measures(raw).filter(value=>!factMeasures.includes(value))))
 const measuresNote=extraMeasures.length ? `<h3>Outras medidas citadas na descrição</h3><p>${escape(extraMeasures.join(' · '))}. Confira a opção selecionada e confirme essas medidas com o atendimento antes da compra.</p>` : ''
 const conflictNote=review.some(label=>facts.filter(f=>f.label===label).length>1) ? '<p>A descrição informa valores diferentes para um mesmo atributo. Confira as opções disponíveis e confirme a medida com o atendimento antes de comprar.</p>' : ''
 const introduction=narrative.replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi,'<p>$1</p>') || `<p>${escape(summary)}</p>`
 const details = `<h3>Detalhes da peça</h3>${introduction}${table}${legacy ? otherTables.join('') : ''}${conflictNote}${measuresNote}${conditions}<h3>Para escolher sua joia</h3>${content?`<p>${escape(content)}</p>`:''}<p>Confira o tamanho, o tipo de encaixe e a compatibilidade com sua joia atual. Em caso de dúvida, fale com o atendimento antes de finalizar.</p>`
 return {refined:true,title,summary:legacy || !product.description ? summary : product.description,longDescription:details,facts,review}
}
