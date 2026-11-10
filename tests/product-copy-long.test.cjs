const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const api=load('src/lib/product-copy.ts',{'./data':load('src/lib/data.ts'),'./stem-description':load('src/lib/stem-description.ts')})
const {rows,pitch,policies,source}=require('./fixtures/product-copy-long.cjs')
test('897 long gold-coated copy is concise even with warranty and measurements outside its table',()=>{
 const bodies=['<table><tr><th>Atributo</th><th>Detalhe</th></tr>'+rows.map(([label,value])=>`<tr><td>${label}</td><td>${value}</td></tr>`).join('')+'</table>', rows.map(([label,value])=>`${label}\t${value}`).join('\n')]
 for(const body of bodies){
  const original=source(body)
  const result=api.refineProductCopy({name:'897 - Piercing Argola D Cravejada em Titânio Revestido de Ouro 24K',description:'A imponência do alto luxo cravejado em uma simetria arquitetônica perfeita.',longDescription:original})
  assert.equal(result.refined,true)
  assert.match(result.longDescription,/<table><caption>Ficha técnica/)
  for(const term of ['1.6mm','24K','Clicker','coração','Dourada','1 Unidade','12mm','1 ano contra defeitos estruturais e de fabricação','sabão neutro','lacre inviolável'])assert.ok(result.longDescription.includes(term),term)
  assert.doesNotMatch(result.longDescription,/image_1cf660|conforto absoluto|tiragem restrita|✦|CURADORIA ANATÔMICA/)
  assert.doesNotMatch(result.summary,/imponência|simetria arquitetônica/)
  assert.ok(result.longDescription.length<2000)
 }
})
test('plain imported 897 text, sterilization restrictions and incomplete specs never restore the entire pitch',()=>{
 const raw='✦ SERENITY ✦\n'+rows.map(row=>row.join('\t')).join('\n')+'\n'+pitch.repeat(8)+'\n'+policies+'\nNão pode ser autoclavada.'
 const result=api.refineProductCopy({name:'Argola D',longDescription:raw})
 assert.equal(result.refined,true)
 assert.match(result.longDescription,/Não pode ser autoclavada/)
 assert.match(result.longDescription,/1 ano contra defeitos/)
 assert.match(result.longDescription,/<th>Cor<\/th><td>Dourada/)
 assert.doesNotMatch(result.longDescription,/image_1cf660|conforto absoluto/)
 const missing=api.refineProductCopy({name:'Argola',longDescription:'<p>✦ SERENITY ✦</p><p>'+pitch.repeat(8)+'</p>'})
 assert.equal(missing.refined,true)
 assert.equal(missing.facts.length,0)
 assert.doesNotMatch(missing.longDescription,/ASTM|hipoalerg|image_1cf660|<table>/)
})

test('every product shares the same section order, including empty, short, legacy and conflicting records',()=>{
 const samples=[
  {name:'Peça sem dados'},
  {name:'Argola',material:'Titânio',description:'Uma peça delicada.'},
  {name:'Labret',longDescription:'Descrição curta sem tabela.'},
  {name:'Argola',longDescription:'<h2>Ficha antiga</h2><p>Material: Titânio</p><p>Diâmetro: 8 mm</p>'},
  {name:'Argola',longDescription:'<p>✦ SERENITY ✦</p><p>Diâmetro: 6 mm</p><p>Diâmetro: 8 mm</p>'},
  {name:'Argola',longDescription:source('<table>'+rows.map(([label,value])=>`<tr><td>${label}</td><td>${value}</td></tr>`).join('')+'</table>')},
 ]
 const expected=['Detalhes da peça','Ficha técnica','Cuidados e condições da compra','Para escolher sua joia']
 for(const product of samples){
  const result=api.refineProductCopy(product)
  assert.equal(result.refined,true,product.name)
  const headings=Array.from(result.longDescription.matchAll(/<(?:h3|caption)>(.*?)<\/(?:h3|caption)>/g)).map(match=>match[1]).filter(label=>expected.includes(label))
  assert.deepEqual(headings,expected,product.name)
  if(!product.material && !product.longDescription?.includes('Material'))assert.doesNotMatch(result.longDescription,/ASTM|ouro|Titânio/)
 }
 assert.match(api.refineProductCopy(samples[0]).longDescription,/especificações técnicas ainda não foram informadas/)
 assert.match(api.refineProductCopy(samples[2]).longDescription,/Descrição curta sem tabela/)
})

test('technical attributes follow the same order independently of their original placement',()=>{
 const a=api.refineProductCopy({name:'Argola',longDescription:'<p>Cor: Dourada</p><p>Diâmetro: 8 mm</p><p>Material: Titânio</p>'})
 const b=api.refineProductCopy({name:'Argola',longDescription:'<p>Material: Titânio</p><p>Cor: Dourada</p><p>Diâmetro: 8 mm</p>'})
 assert.deepEqual(a.facts,b.facts)
 assert.deepEqual(Array.from(a.facts,f=>f.label),['Material','Diâmetro','Cor'])
})
