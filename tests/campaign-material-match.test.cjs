const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs')
const match=load('src/lib/campaign-material-match.ts')
test('all implant titanium aliases belong to natural titanium, with title/tag fallback and separate coated products',()=>{
 for(const selected of ['Titânio','Titânio Cor Natural','Titanio Natural','Titânio Grau Implante (ASTM F136)']){
  for(const product of [
   {material:'Titânio Grau Implante (ASTM F136)',name:'Topo Lua Crescente'},
   {material:'Titânio Cor Natural',name:'Labret'},
   {material:'',name:'Labret Flor — Titânio Grau Implante (ASTM F136)'},
   {material:null,name:'Topo',tags:['anodizavel','titanio']},
   {material:'',name:'Topo',tags:['TITÂNIO']},
  ])assert.equal(match.matchesCampaignMaterial(product,selected),true,JSON.stringify({product,selected}))
  for(const product of [
   {material:'Titânio Revestido de Ouro 18K',tags:['titanio']},
   {material:'Titânio',name:'Topo Titânio banhado em ouro'},
   {material:'',name:'Topo Titânio PVD dourado',tags:['titanio']},
   {material:'Bioflex',tags:['titanio']},
   {material:'Ouro 18K',tags:['titanio']},
   {material:'Aço Cirúrgico',tags:['titanio']},
  ])assert.equal(match.matchesCampaignMaterial(product,selected),false,JSON.stringify({product,selected}))
 }
 assert.equal(match.matchesCampaignMaterial({material:'Ouro 18K'},'Ouro 18K'),true)
 assert.equal(match.matchesCampaignMaterial({material:'Titânio'},'Titânio Revestido'),false)
})

test('gold-coated titanium aliases match without admitting solid gold, steel, natural titanium or black PVD',()=>{
 const selected='Titânio Revestido de Ouro 18K'
 for(const product of [
  {material:'Titânio revestido ouro 18k'},
  {material:'Titanium PVD Gold'},
  {material:'',name:'PVD 1228 Argola - Titânio banhado em ouro 18K'},
  {material:'Titânio PVD',name:'Argola Titânio dourado'},
 ])assert.equal(match.matchesCampaignMaterial(product,selected),true)
 for(const product of [
  {material:'Ouro 18K',tags:['titanio']},
  {material:'Aço PVD dourado',tags:['titanio']},
  {material:'Titânio Cor Natural'},
  {material:'Titânio PVD preto',tags:['gold']},
  {material:'Bioflex',name:'Titânio dourado'},
 ])assert.equal(match.matchesCampaignMaterial(product,selected),false)
})
