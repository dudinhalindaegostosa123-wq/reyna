const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const api=load('src/lib/product-copy.ts',{'./data':load('src/lib/data.ts'),'./stem-description':load('src/lib/stem-description.ts')})
const product={name:'TN1072 - Topo Opala Branca Microdermal 1.6mm - Titânio Revestido de Ouro 18k',material:'Titânio Revestido de Ouro 18k',description:'',longDescription:'<p data-path-to-node="0">Biossegurança absoluta, cicatrização perfeita e tiragem restrita.</p><ul><li><b>Material Base:</b> Titânio ASTM F136 revestido de ouro 18k</li><li><b>Mecanismo:</b> Rosca de 1.2mm (compatível com haste de 1.6mm)</li><li><b>Dimensões:</b> Topo 3.0 mm, 4.0 mm ou 5.0 mm</li><li>Venda: 1 unidade (Haste vendida separadamente)</li></ul>'}
test('legacy copy retains exact technical measures and distinguishes thread from shaft without inventing compatibility',()=>{
 const copy=api.refineProductCopy(product)
 assert.equal(copy.refined,true);assert.ok(copy.facts.some(f=>f.value.includes('1.2mm (compatível com haste de 1.6mm)')))
 assert.match(copy.longDescription,/3.0 mm, 4.0 mm ou 5.0 mm/)
 assert.match(copy.longDescription,/vendida separadamente/)
 assert.doesNotMatch(copy.longDescription,/cicatrização perfeita|biossegurança absoluta|tiragem restrita/i)
 assert.equal(api.commercialProductName(product.name),'Labret Opala Branca Microdermal 1.6mm - Titânio Revestido de Ouro 24K')
 assert.equal(api.commercialProductName('TN112 Haste Labret'),'Haste Labret')
})
test('modern descriptions keep their content inside the shared presentation and respect stem policy',()=>{
 const modern={...product,longDescription:'<p>Uma joia em titânio. Confira as medidas.</p>',description:'Descrição escrita pela loja.'}
 assert.ok(api.refineProductCopy(modern).longDescription.includes(modern.longDescription))
 assert.equal(api.refineProductCopy(modern).refined,true)
 const copy=api.refineProductCopy({...product,includesStem:true})
 assert.doesNotMatch(copy.longDescription,/vendida separadamente/)
 assert.match(copy.longDescription,/haste opcional/);assert.doesNotMatch(copy.longDescription,/sem custo adicional/)
})
test('tables are read as label/value pairs and conflicting values are marked for review',()=>{
 const copy=api.refineProductCopy({...product,longDescription:'<p data-path-to-node="0">Peça.</p><table><tr><td>Diâmetro Interno</td><td>6 mm</td></tr><tr><td>Diâmetro Interno</td><td>8 mm</td></tr></table>'})
 assert.ok(copy.review.includes('Diâmetro interno'))
 assert.equal(copy.facts.filter(f=>f.label==='Diâmetro interno').length,2)
})
test('unmapped measurements and conflicting facts remain visible without restoring promotional prose',()=>{
 const missing={...product,longDescription:product.longDescription+'<p>Outra medida da haste: 7 mm.</p>'}
 const result=api.refineProductCopy(missing)
 assert.equal(result.refined,true);assert.match(result.longDescription,/7mm/);assert.doesNotMatch(result.longDescription,/cicatrização perfeita/)
 assert.ok(result.review.includes('Medidas fora da ficha técnica'))
 const conflict={...product,longDescription:product.longDescription+'<p>Dimensões: 6 mm</p>'}
 assert.equal(api.refineProductCopy(conflict).refined,true)
 assert.match(api.refineProductCopy(conflict).longDescription,/valores diferentes/)
})
test('references remain searchable identifiers while visible titles and escaped facts stay clean',()=>{
 assert.equal(api.productReference(product.name),'TN1072')
 assert.equal(api.productReference(product.name,'custom-sku'),'custom-sku')
 assert.equal(api.commercialProductName('Argola Lisa 8 mm'),'Argola Lisa 8 mm')
 const result=api.refineProductCopy({...product,longDescription:product.longDescription.replace('Opala','Opala &lt;img onerror=evil&gt;')})
 assert.doesNotMatch(result.longDescription,/<img|<script/)
})
test('decimal places and physical units cannot collapse into another measurement',()=>{
 const conflict={...product,longDescription:'<p data-path-to-node="0">Ficha.</p><ul><li>Diâmetro: 1.2 mm</li><li>Diâmetro: 12 mm</li></ul>'}
 const result=api.refineProductCopy(conflict)
 assert.equal(result.facts.filter(f=>f.label==='Diâmetro').length,2);assert.equal(result.refined,true)
 assert.match(result.longDescription,/1.2 mm/);assert.match(result.longDescription,/12 mm/)
 const units={...product,longDescription:product.longDescription+'<p>Outra dimensão: 3 cm.</p>'}
 assert.equal(api.refineProductCopy(units).refined,true)
 assert.match(api.refineProductCopy(units).longDescription,/3cm/)
})

test('labret wording preserves old links and technical measurements',()=>{
 const {labretCopy}=load('src/lib/stem-description.ts')
 assert.equal(labretCopy('<a href="/categoria/topos-e-correntes">Topos 1.6 mm</a>'),'<a href="/categoria/topos-e-correntes">Labrets 1.6 mm</a>')
 const commerce=load('src/lib/commerce.ts')
 assert.equal(commerce.isTopProduct({name:'Labret Estrela',originalName:'Topo Estrela'}),true)
 assert.equal(commerce.isTopProduct({name:'Haste Labret',originalName:'Haste Labret'}),false)
 assert.equal(commerce.isMicrodermalTop({name:'Labret Microdermal 1.6mm'}),true)
 assert.equal(commerce.STEM_LABELS['6'],'6 mm (perfuração cicatrizada/downsize)')
})


test('references accept TR, PVD and other catalogue prefixes without swallowing materials or measurements',()=>{
 for (const [name,reference,title] of [
  ['TR 736 - Labret Costela e Coração','TR736','Labret Costela e Coração'],
  ['PVD 1228 - Argola Clicker Frontal','PVD1228','Argola Clicker Frontal'],
  ['PVD1211 – Argola Clicker Linha','PVD1211','Argola Clicker Linha'],
  ['BF123A: Labret Transparente','BF123A','Labret Transparente'],
  ['OR114 - Microbell Navete','OR114','Microbell Navete'],
 ]) {
  assert.equal(api.productReference(name),reference)
  assert.equal(api.commercialProductName(name),title)
 }
 for (const name of ['Ouro 18k Maciço','Prata 925 Argola','Titânio 23 Argola','ASTM 136 Labret','Argola Lisa 8 mm']) {
  assert.equal(api.productReference(name),'')
  assert.equal(api.commercialProductName(name),name)
 }
 assert.equal(api.commercialProductName('CUSTOM-001 - Argola Lisa','CUSTOM-001'),'Argola Lisa')
 assert.equal(api.productReference('PVD1228 - Argola','CADASTRO-42'),'CADASTRO-42')
})

test('ordinary structured descriptions become a technical table while preserving care and conditions',()=>{
 const raw='<p>Uma argola delicada para sua composição.</p><ul><li>Material: Titânio ASTM F136</li><li>Diâmetro interno: 8 mm</li><li>Limpe com pano macio.</li></ul><p>Trocas: consulte as condições da loja.</p>'
 const result=api.refineProductCopy({name:'Argola',description:'Uma argola delicada.',longDescription:raw})
 assert.equal(result.refined,true)
 assert.equal(result.summary,'Uma argola delicada.')
 assert.match(result.longDescription,/<table><caption>Ficha técnica/)
 assert.match(result.longDescription,/<th>Diâmetro interno<\/th><td>8 mm<\/td>/)
 assert.match(result.longDescription,/Uma argola delicada para sua composição/)
 assert.match(result.longDescription,/Limpe com pano macio/)
 assert.match(result.longDescription,/Trocas: consulte/)
 assert.equal((result.longDescription.match(/Titânio ASTM F136/g)||[]).length,1)
})

test('technical formatting retains unrecognized table rows and never invents missing specifications',()=>{
 const result=api.refineProductCopy({name:'Argola',longDescription:'<table><tr><th>Material</th><td>Titânio</td></tr><tr><th>Diâmetro</th><td>8 mm</td></tr><tr><th>Observação especial</th><td>Embalagem individual.</td></tr></table>'})
 assert.equal(result.refined,true)
 assert.match(result.longDescription,/Embalagem individual/)
 assert.doesNotMatch(result.longDescription,/ASTM|hipoalergênic|esterilizad/i)
})

test('OR113/OR114 imported specs and three-column variant measures are retained as real tables',()=>{
 const specs=[['Material','Ouro 18K maciço'],['Desenho','Navete com pingente redondo articulado'],['Pedras','Zircônias translúcidas'],['Dimensões da parte superior','6,5 × 3,0 mm'],['Medida do pingente','3,5 mm'],['Espessura da haste','1,2 mm'],['Comprimento da haste','6 ou 8 mm, conforme a opção escolhida'],['Fechamento','Rosca externa'],['Conteúdo','1 microbell completo com haste, navete e pingente']]
 const variation='<table><tr><th>Código</th><th>Medida da haste</th><th>Peso informado</th></tr><tr><td>OR113</td><td>1,2 × 6 mm</td><td>0,630 g</td></tr><tr><td>OR114</td><td>1,2 × 8 mm</td><td>0,664 g</td></tr></table>'
 for(const body of ['<table>'+specs.map(([label,value])=>`<tr><td>${label}</td><td>${value}</td></tr>`).join('')+'</table>',specs.map(([label,value])=>`<p>${label} ${value}</p>`).join('')]){
  const result=api.refineProductCopy({name:'OR113 / OR114 - Microbell Navete Cravejado com Pingente – Ouro 18K Maciço',description:'Uma navete de zircônia encontra o movimento de um pequeno pingente.',longDescription:'<p>✦ SERENITY ✦</p>'+body+variation})
  assert.equal(result.refined,true,JSON.stringify(result.review))
  assert.match(result.longDescription,/<caption>Ficha técnica/)
  assert.match(result.longDescription,/6,5 × 3,0 mm/)
  assert.match(result.longDescription,/Ouro 18K maciço/)
  assert.ok(result.longDescription.includes(variation))
  assert.doesNotMatch(result.longDescription,/✦/)
 }
})

test('plain text fields without colons are formatted without losing other content',()=>{
 const result=api.refineProductCopy({name:'Argola',longDescription:'Uma joia delicada.\nMaterial Titânio\nDiâmetro interno 8 mm\nGuarde em local seco.'})
 assert.equal(result.refined,true)
 assert.match(result.longDescription,/<th>Material<\/th><td>Titânio/)
 assert.match(result.longDescription,/Guarde em local seco/)
})
