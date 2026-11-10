const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{nodes}=require('./helpers/render.cjs')
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'}
test('category menu distinguishes Topo from the Labret landing page even with old display settings',async()=>{
 const {GET}=load('src/app/api/categorias/route.ts',{
  '@/lib/stem-description':load('src/lib/stem-description.ts'),
  'next/server':{NextResponse:{json:(body)=>body}},
  '@/lib/catalog-server':{getStoreCategories:async()=>[{slug:'topo',name:'Labret',count:2},{slug:'hastes-e-conectores',name:'Hastes',count:2}]}
 },{SUPABASE_URL:'https://fixture.example',SUPABASE_PUBLISHABLE_KEY:'public'}, {fetch:async()=>new Response(JSON.stringify([{slug:'topo',name:'Labret',hidden_from_menu:false}]),{headers:{'content-range':'0-0/1'}})})
 const result=await GET()
 assert.equal(result.categories.find(c=>c.href==='/categoria/topo').name,'Topo')
 assert.equal(result.categories.find(c=>c.href==='/categoria/labret').name,'Labret')
})
test('stone category loads the same banner images as home and only offers available region facets',async()=>{
 const stone=load('src/lib/stone-colors.ts'),homeImages=load('src/lib/home-images.ts',{'./stone-colors':stone})
 const {default:Page}=load('src/app/cores/[cor]/page.tsx',{
  'react/jsx-runtime':jsx,'next/link':{default:'Link'},'next/navigation':{notFound(){throw Error('404')}},
  '@/lib/stone-definitions-server':{},
  '@/lib/site-banners':{getSiteBanners:async()=>[{slot:'category',cta:'home-stone-v1',href:'/cores/verde',image_desktop:'/green.webp'}]},
  '@/lib/home-images':homeImages,
  '@/lib/stone-collections-server':{getStoneCollections:async()=>[{id:'verde',name:'Verde',color:'#17654D',products:[{id:'p'}]}],getStonePage:async()=>({products:[],materials:[],page:1,total:0,totalPages:0})},
  '@/lib/catalog-area':{normalizeArea:x=>x || 'all',normalizeSubarea:()=> 'all'},
  '@/lib/catalog-facets-server':{getCatalogFacets:async()=>({areas:[{value:'all',label:'Todas as regiões'},{value:'orelha',label:'Orelha'}],subareas:[],materials:['Titânio']})},
  '@/app/categoria/[slug]/CategoryPageClient':{default:'Category'},'@/components/home/StoneColorCarousel':{default:'Carousel'}
 })
 const tree=await Page({params:{cor:'verde'}})
 assert.equal(nodes(tree,n=>n.type==='Carousel')[0].props.colors[0].image,'/green.webp')
 const category=nodes(tree,n=>n.type==='Category')[0]
 assert.deepEqual(Array.from(category.props.areas,x=>x.value),['all','orelha'])
})
