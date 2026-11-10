const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{nodes}=require('./helpers/render.cjs')
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'}
function homeFixture(banners, catalog, colors){
 const calls=[]
 const mocks={react:{Suspense:'Suspense'},'react/jsx-runtime':jsx,'next/image':{default:'Image'},'next/link':{default:'Link'},'@/lib/titanium-copy':{TITANIUM_INTRO:'Titânio'},'@/lib/store-information':{STORE_INFORMATION:{}},'@/lib/home-images':{bannerPlacement:b=>b.slot,homeImageMap:()=>({})},'@/lib/site-banners':{getSiteBanners:async()=>banners},'@/lib/stone-collections-server':{getStoneCollections:async()=>[]},'@/lib/catalog-server':{getStorePreview:async options=>{calls.push(options);return (catalog ? await catalog(options) : {products:[{id:options.category==='novidades'?'new':'essential',name:'Peça de teste'}]}).products}}}
 for(const path of ['home/StoneColorCarousel','home/ManagedHero','ui/ProductCard','home/EarMiniBanners','home/CategoryDiscoveryGrid','home/InstagramGrid','home/MaterialsSection'])mocks['@/components/'+path]={default:path}
 if(colors)mocks['@/lib/stone-collections-server']={getStoneCollections:colors}
 return {page:load('src/app/page.tsx',mocks),calls}
}
async function resolve(tree){
 if(Array.isArray(tree))return Promise.all(tree.map(resolve))
 if(!tree || typeof tree!=='object')return tree
 if(typeof tree.type==='function')return resolve(await tree.type(tree.props))
 if(tree.type==='Suspense')return resolve(tree.props.children)
 return {...tree,props:{...tree.props,children:await resolve(tree.props.children)}}
}
async function renderHome(banners){
 const {page,calls}=homeFixture(banners)
 return {tree:await resolve(await page.default()),calls}
}
test('hero and section headings render without waiting for product or color queries',async()=>{
 const {page,calls}=homeFixture(null,()=>new Promise(()=>{}))
 const shell=await page.default()
 assert.equal(nodes(shell,n=>n.type==='home/ManagedHero').length,1)
 assert.equal(nodes(shell,n=>n.type==='Suspense').length,3)
 assert.equal(calls.length,0)
 assert.equal(page.dynamic,undefined)
 assert.equal(page.revalidate,60)
})
test('failed product and optional color queries do not remove the home or fabricate products',async()=>{
 const {page}=homeFixture(null,async()=>{throw new Error('DATABASE_UNAVAILABLE')},async()=>{throw new Error('STONE_COLORS_READ')})
 const tree=await resolve(await page.default())
 assert.equal(nodes(tree,n=>n.type==='home/ManagedHero').length,1)
 assert.equal(nodes(tree,n=>n.type==='home/CategoryDiscoveryGrid').length,1)
 assert.equal(nodes(tree,n=>n.type==='ui/ProductCard').length,0)
 assert.equal(nodes(tree,n=>n.props.role==='status').length,2)
 assert.equal(nodes(tree,n=>n.type==='home/StoneColorCarousel').length,0)
 assert.equal(nodes(tree,n=>n.props['aria-labelledby']==='titanium-title').length,1)
})
test('one failed product section does not hide a successful independent section',async()=>{
 const {page}=homeFixture(null,async({category})=>{if(category==='novidades')throw new Error('TIMEOUT');return {products:[{id:'essential'}]}})
 const tree=await resolve(await page.default())
 assert.deepEqual(nodes(tree,n=>n.type==='ui/ProductCard').map(n=>n.props.product.id),['essential'])
 assert.equal(nodes(tree,n=>n.props.role==='status').length,1)
})
test('framework dynamic rendering and redirect exceptions are propagated',async()=>{
 for(const digest of ['DYNAMIC_SERVER_USAGE','NEXT_REDIRECT;replace;/minha-conta;307;','NEXT_NOT_FOUND']){
  const error={digest}
  const {page}=homeFixture(null,async()=>{throw error})
  await assert.rejects(resolve(await page.default()),value=>value===error)
 }
})
for(const banners of [null,[]])test(`Lunarity hero and numbered home order work with ${JSON.stringify(banners)} banners`,async()=>{
 const {tree,calls}=await renderHome(banners)
 assert.equal(calls[0].category,'novidades')
 const hero=nodes(tree,n=>n.type==='home/ManagedHero')[0].props.banner
 assert.equal(hero.image_desktop,'/banners/lunarity-hero.webp')
 assert.equal(hero.image_mobile,'/banners/lunarity-hero-portrait.webp')
 assert.equal(hero.href,'/categoria/todos')
 assert.equal(hero.title,'Cada fase, um novo brilho.')
 assert.ok(!/swarovski/i.test(JSON.stringify(hero)))
 assert.equal(nodes(tree,n=>n.props.className==='lunarity-home-sparkle').length,0)
 assert.equal(nodes(tree,n=>n.type==='home/CategoryDiscoveryGrid')[0].props.items.length,8)
 assert.ok(nodes(tree,n=>n.type==='home/CategoryDiscoveryGrid')[0].props.items.every(item=>item.image.startsWith('/banners/lunarity-categorias/')&&item.mobileImage.includes('-mobile.webp')))
 const blocks=tree.props.children.filter(child=>child && typeof child==='object')
 const position=predicate=>blocks.findIndex(predicate)
 const sequence=[
  n=>n.type==='home/ManagedHero',
  n=>n.props['aria-labelledby']==='arrivals-title',
  n=>n.type==='home/CategoryDiscoveryGrid',
  n=>n.props['aria-labelledby']==='ear-details-title',
  n=>n.type==='home/MaterialsSection',
  n=>n.props['aria-label']==='Inspiração Lunarity',
  n=>n.props['aria-labelledby']==='labrets-title',
  n=>n.props['aria-labelledby']==='titanium-title',
 ].map(position)
 assert.ok(sequence.every((value,index)=>value>=0 && (index===0 || value>sequence[index-1])))
 assert.equal(position(n=>n.props['aria-labelledby']==='labrets-title'),position(n=>n.props['aria-label']==='Inspiração Lunarity')+1)
 assert.equal(blocks.at(-1).props['aria-labelledby'],'titanium-title')
 assert.deepEqual(nodes(tree,n=>n.type==='ui/ProductCard').map(n=>n.props.product.id),['new','essential'])
})
test('inherited Swarovski campaigns are replaced while a deliberate custom campaign remains configurable',async()=>{
 const campaign={id:'configured',slot:'hero',title:'Minha coleção',subtitle:'Minhas joias',href:'/categoria/todos',image_desktop:'/custom.webp',image_mobile:'',text_tone:'light',position:0,alt:'Minha campanha'}
 for(const patch of [{title:'SWAROVSKI'},{subtitle:'Exclusivos Swarovski'},{href:'/categoria/swarovski'},{image_desktop:'/banners/banner-swarovski.webp'}]){
  const {tree}=await renderHome([{...campaign,...patch}])
  assert.equal(nodes(tree,n=>n.type==='home/ManagedHero')[0].props.banner.id,'lunarity-hero')
 }
 const {tree}=await renderHome([campaign])
 assert.equal(nodes(tree,n=>n.type==='home/ManagedHero')[0].props.banner.image_desktop,'/custom.webp')
})
test('a categories-only configuration still has a hero and avoids the header covering the next section',async()=>{
 const {tree}=await renderHome([{id:'category',slot:'category',title:'Orelha',subtitle:'Joias',href:'/orelha',image_desktop:'/orelha.webp'}])
 assert.equal(nodes(tree,n=>n.type==='home/ManagedHero').length,1)
})
test('legacy local category pictures use the dark collection while uploaded pictures remain configurable',async()=>{
 const {tree}=await renderHome([
  {id:'ear',slot:'category',title:'Orelha',subtitle:'Joias',href:'/orelha',image_desktop:'/banners/orelha.webp',image_mobile:'/banners/orelha-mobile.webp'},
  {id:'nose',slot:'category',title:'Nariz',subtitle:'Joias',href:'/nariz',image_desktop:'https://fixture.supabase.co/storage/custom.webp',image_mobile:'https://fixture.supabase.co/storage/custom-mobile.webp'},
 ])
 const items=nodes(tree,n=>n.type==='home/CategoryDiscoveryGrid')[0].props.items
 assert.equal(items[0].image,'/banners/lunarity-categorias/orelha-desktop.webp')
 assert.equal(items[0].mobileImage,'/banners/lunarity-categorias/orelha-mobile.webp')
 assert.equal(items[1].image,'https://fixture.supabase.co/storage/custom.webp')
})
test('footer omits social, email and physical-store links when Lunarity contacts are unset',()=>{
 const {default:Footer}=load('src/components/layout/Footer.tsx',{
  'react/jsx-runtime':jsx,'next/link':{default:'Link'},'@/components/brand/Brand':{default:'Brand'},'lucide-react':{MapPin:'MapPin',ArrowUpRight:'ArrowUpRight'},
  '@/lib/store-information':{STORE_INFORMATION:{whatsapp:'',instagram:'',email:''}},
 })
 const tree=Footer()
 assert.equal(nodes(tree,n=>n.type==='a').length,0)
 assert.ok(!/serenity|wa\.me|mailto:/i.test(JSON.stringify(tree)))
})
