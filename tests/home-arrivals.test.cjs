const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{nodes}=require('./helpers/render.cjs')
for (const bannerResponse of [null, []]) {
test(`home keeps local hero and category banners when banner query returns ${JSON.stringify(bannerResponse)}`,async()=>{
 const calls=[],jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'}
 const mocks={'react/jsx-runtime':jsx,'next/image':{default:'Image'},'next/link':{default:'Link'},'@/lib/titanium-copy':{TITANIUM_INTRO:'Titânio'},'@/lib/store-information':{STORE_INFORMATION:{}},'@/lib/home-images':{bannerPlacement:b=>b.slot,homeImageMap:()=>({})},'@/lib/site-banners':{getSiteBanners:async()=>bannerResponse},'@/lib/stone-collections-server':{getStoneCollections:async()=>[]},'@/lib/catalog-server':{getStorePage:async options=>{calls.push(options);return {products:options.category==='novidades'?[{id:'new',name:'Nova peça'}]:[]}}}}
 for(const path of ['home/StoneColorCarousel','home/ManagedHero','ui/ProductCard','home/EarMiniBanners','home/CategoryBanners','home/InstagramGrid','home/MaterialsSection'])mocks['@/components/'+path]={default:path}
 const {default:Home}=load('src/app/page.tsx',mocks)
 const tree=await Home()
 assert.equal(calls[0].category,'novidades')
 const sections=nodes(tree,n=>n.type==='home/ManagedHero' || n.props['aria-labelledby']==='arrivals-title' || n.type==='home/StoneColorCarousel')
 assert.equal(sections[0].props.banner.image_desktop,'/banners/banner-swarovski.webp');
 assert.equal(nodes(tree,n=>n.type==='home/CategoryBanners')[0].props.items.length,8);
 assert.equal(sections[0].type,'home/ManagedHero');assert.equal(sections[1].props['aria-labelledby'],'arrivals-title');assert.equal(sections[2].type,'home/StoneColorCarousel')
 assert.equal(nodes(tree,n=>n.props['aria-labelledby']==='arrivals-title').length,1)
 assert.equal(nodes(tree,n=>n.type==='ui/ProductCard')[0].props.product.id,'new')
})

}

test('footer omits social, email and physical-store links when Lunarity contacts are unset',()=>{
 const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'}
 const {default:Footer}=load('src/components/layout/Footer.tsx',{
  'react/jsx-runtime':jsx,'next/link':{default:'Link'},'@/components/brand/Brand':{default:'Brand'},'lucide-react':{MapPin:'MapPin',ArrowUpRight:'ArrowUpRight'},
  '@/lib/store-information':{STORE_INFORMATION:{whatsapp:'',instagram:'',email:''}},
 })
 const tree=Footer()
 assert.equal(nodes(tree,n=>n.type==='a').length,0)
 assert.ok(!/serenity|wa\.me|mailto:/i.test(JSON.stringify(tree)))
})
