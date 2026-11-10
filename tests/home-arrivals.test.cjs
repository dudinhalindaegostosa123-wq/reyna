const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{nodes}=require('./helpers/render.cjs')
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'}
async function home({banners=null,products=[{id:'new',name:'Nova peça'}],getPage}={}){
 const calls=[]
 const mocks={
  'react/jsx-runtime':jsx,'next/image':{default:'Image'},'next/link':{default:'Link'},
  '@/components/brand/Brand':{LunarMark:'LunarMark'},'@/components/ui/ProductCard':{default:'ProductCard'},
  '@/lib/site-banners':{getSiteBanners:async()=>banners},
  '@/lib/catalog-server':{getStorePage:async options=>{calls.push(options);return getPage?getPage(options):{products}}},
 }
 const {default:Home}=load('src/app/page.tsx',mocks)
 return {tree:await Home(),calls}
}
for(const banners of [null,[]])test(`Lunarity has a hero, category links and real products with ${JSON.stringify(banners)} banners`,async()=>{
 const {tree,calls}=await home({banners})
 assert.equal(nodes(tree,n=>n.type==='h1').length,1)
 assert.equal(nodes(tree,n=>n.type==='Image' && n.props.priority)[0].props.src,'/banners/titanio.webp')
 assert.equal(nodes(tree,n=>n.type==='ProductCard')[0].props.product.id,'new')
 assert.equal(calls[0].category,'novidades')
 for(const href of ['/orelha','/nariz','/categoria/umbigo','/materiais/titanio','/categoria/todos'])assert.ok(nodes(tree,n=>n.type==='Link' && n.props.href===href).length)
})
test('configured banner photo does not restore inherited campaign text',async()=>{
 const {tree}=await home({banners:[{slot:'hero',image_desktop:'/own.webp',title:'Old campaign'}]})
 assert.equal(nodes(tree,n=>n.type==='Image' && n.props.priority)[0].props.src,'/own.webp')
 assert.ok(!JSON.stringify(tree).includes('Old campaign'))
})
test('empty new-arrivals selection falls back to the real catalog',async()=>{
 const {tree,calls}=await home({getPage:async options=>({products:options.category?[]:[{id:'catalog'}]})})
 assert.equal(calls.length,2)
 assert.equal(nodes(tree,n=>n.type==='ProductCard')[0].props.product.id,'catalog')
})
test('catalog errors leave an honest empty state and working discovery links',async()=>{
 const {tree}=await home({getPage:async()=>{throw Error('unavailable')}})
 assert.equal(nodes(tree,n=>n.type==='ProductCard').length,0)
 assert.equal(nodes(tree,n=>n.props.className==='ln-catalog-empty').length,1)
 assert.ok(nodes(tree,n=>n.type==='Link' && n.props.href==='/categoria/todos').length)
})
test('footer omits social, email and physical-store links when Lunarity contacts are unset',()=>{
 const {default:Footer}=load('src/components/layout/Footer.tsx',{
  'react/jsx-runtime':jsx,'next/link':{default:'Link'},'@/components/brand/Brand':{default:'Brand'},
  '@/lib/store-information':{STORE_INFORMATION:{whatsapp:'',instagram:'',email:''}},
 })
 const tree=Footer()
 assert.equal(nodes(tree,n=>n.type==='a').length,0)
 assert.ok(!/serenity|wa\.me|mailto:/i.test(JSON.stringify(tree)))
})
