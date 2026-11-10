const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{renderer,nodes}=require('./helpers/render.cjs')
function fixture(){
 const mocks={
  'next/image':{default:'Image'},'next/link':{default:'Link'},'lucide-react':{},clsx:{default:(...xs)=>xs.filter(Boolean).join(' ')},
  '@/lib/promotion':load('src/lib/promotion.ts'),'@/lib/product-copy':{commercialProductName:x=>x,productReference:()=>''},'@/lib/store-information':{STORE_INFORMATION:{}},'@/lib/stem-description':{rewriteStemDescription:x=>x},
  '@/lib/commerce':{isMicrodermalTop:()=>false,supportsSterilization:()=>false,isStem:()=>true},'@/lib/variation-dimensions':{buildVariationDimensions:()=>null},'@/lib/anodization':{ANODIZATION_FEE:15,anodizedPrice:(price,fee)=>price+fee,canAnodize:()=>false},
  '@/lib/data':load('src/lib/data.ts'),'@/lib/cart':{useCartStore:()=>({commercePolicy:{},addItem(){},openCart(){}})},'../anodization-actions':{}
 }
 for(const path of ['product/ProductDescription','product/StemChoice','product/SterilizationOptions','product/DimensionalVariationSelector','product/AnodizationOptions','ui/ProductCard','product/RestockForm'])mocks['@/components/'+path]={default:path}
 return renderer('src/app/produto/[slug]/ProductPageClient.tsx',mocks)
}
const base={id:'p',slug:'lua',name:'Lua',sku:'TN1057',category:'Topo',categorySlug:'topo',price:100,originalPrice:120,priceAvailable:true,inStock:false,images:[],variants:[],tags:[],description:'',longDescription:''}
test('product detail suppresses unavailable prices and purchase, offering a restock signup instead',()=>{
 const tree=fixture().render({product:base,related:[]})
 assert.equal(nodes(tree,n=>n.props['aria-label']==='Preço atual' || n.type==='del').length,0)
 assert.equal(nodes(tree,n=>n.type==='product/RestockForm')[0].props.slug,'lua')
 assert.ok(nodes(tree,n=>n.type==='button' && n.props.disabled===true).length>0)
})
test('partially stocked products show the available selected price while signup tracks only sold-out variations',()=>{
 const variations=[{id:'1',name:'Azul',price:100,priceAvailable:true,inStock:true},{id:'2',name:'Rosa',price:120,priceAvailable:true,inStock:false}]
 const product={...base,inStock:true,variations,variants:[{label:'Variação',options:variations.map(v=>({value:v.id,name:v.name,inStock:v.inStock}))}]}
 const tree=fixture().render({product,related:[],initialVariation:'1'})
 assert.equal(nodes(tree,n=>n.props['aria-label']==='Preço atual').length,1)
 const form=nodes(tree,n=>n.type==='product/RestockForm')[0]
 assert.equal(form.props.variants.length,1);assert.equal(form.props.variants[0].id,'2')
})
