const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto')
const {load}=require('./helpers/load.cjs'),{renderer,nodes}=require('./helpers/render.cjs')
const commerce=load('src/lib/commerce.ts'),anodization=load('src/lib/anodization.ts'),data=load('src/lib/data.ts')
assert.equal(commerce.existingVariantStem({'Comprimento da Haste':'10mm'}),'10')
assert.equal(commerce.existingVariantStem({'Comprimento da pedra':'6mm'}),undefined)
const policy={version:1,anodization_fee:0,included_stems:true,retail_free_shipping_minimum_cents:45000,free_shipping_after_discounts:true}
function cart(){let state;const api=load('src/lib/cart.ts',{'./commerce':commerce,'@/lib/data':data,'./anodization':anodization,'./ready-project':{projectCart:()=>null},zustand:{create:()=>initializer=>{const set=update=>{const next=typeof update==='function'?update(state):update;state={...state,...next}};state=initializer(set,()=>state);return {getState:()=>state}}},'zustand/middleware':{persist:fn=>fn}});return api.useCartStore}
const product={id:'p',slug:'top',name:'Topo Titânio',price:82,includesStem:true,anodizationFee:0,tags:['anodizavel'],images:[],variants:[],stock:2,inStock:true}
test('optional stem changes charge per unit, remove surcharge and merge the same top selection',()=>{
 const store=cart();assert.equal(store.getState().addItem(product,1,{},'28'),true)
 assert.equal(store.getState().items[0].price,82)
 assert.equal(store.getState().addItem(product,1,{},'28','8'),true)
 assert.equal(store.getState().items[1].price,87)
 const key=store.getState().items[1].variantKey
 store.getState().setStem(key,'6');assert.equal(store.getState().items[1].stem,'6')
 store.getState().setStem(store.getState().items[1].variantKey,'')
 assert.equal(store.getState().items.length,1);assert.equal(store.getState().items[0].quantity,2)
 assert.equal(store.getState().items[0].price,82);assert.equal(store.getState().items[0].stemFee,0)
 assert.equal(store.getState().items[0].variants['Haste incluída'],undefined)
 store.getState().setStem(store.getState().items[0].variantKey,'8')
 assert.equal(store.getState().total(),174)
 store.getState().applyCommercePolicy({...policy,stem_fee:5})
 store.getState().applyCommercePolicy({...policy,stem_fee:5})
 assert.equal(store.getState().items[0].price,87)
})
test('free shipping applies to the cheapest quote only, after coupon/progressive, and never changes provider costs or wholesale',async()=>{
 const shipping=load('src/lib/shipping.ts'),gateway=load('src/lib/melhor-envio.ts'),saved=[]
 const db={from:table=>table==='serenity_shipping_settings'?{select:()=>({eq:()=>({single:async()=>({data:{enabled:true,max_units:10,manual_slugs:[],weight_g:500,height:2,width:12,length:17,origin:'18072000',version:1}})})})}:{delete:()=>({lt:async()=>({})}),insert:async rows=>{saved.push(...rows);return {error:null}}}}
 const raw=[{id:1,name:'Express',price:'30.00',delivery_time:2,company:{name:'Carrier'}},{id:2,name:'Normal',price:'15.00',delivery_time:5,company:{name:'Carrier'}}]
 const service=load('src/lib/shipping-server.ts',{'@/lib/commerce-server':{getCommercePolicy:async()=>policy},'node:crypto':{randomUUID},'@/lib/checkout-server':{checkoutHash:()=> 'hash'},'@/lib/shipping':shipping,'@/lib/melhor-envio':{readQuotes:gateway.readQuotes,melhorEnvio:async()=>raw}})
 const lines=[{slug:'top',variant:'',quantity:1,color:'',stem:'6'}]
 let result=await service.deliveryOptions(db,lines,randomUUID(),'18072000',{total_cents:50000},undefined,{total_cents:44999});assert.ok(result.options.every(option=>option.amount_cents>0))
 result=await service.deliveryOptions(db,lines,randomUUID(),'18072000',{total_cents:50000},undefined,{total_cents:45000});assert.equal(result.options.filter(option=>option.amount_cents===0).length,1);assert.equal(saved.find(row=>row.snapshot.free_shipping)?.snapshot.free_shipping.original_amount_cents,1500);assert.equal(raw[1].price,'15.00')
 const user=randomUUID(),wholesale={total_cents:100000,pricing_mode:'wholesale',wholesale:{active:true,discount_percent:50,minimum_products_cents:100000,settings_version:1,account_version:1,products_cents:100000,minimum_met:true}}
 result=await service.deliveryOptions(db,lines,randomUUID(),'18072000',wholesale,user,wholesale);assert.ok(result.options.every(option=>option.amount_cents>0))
})
test('mini banners and color photographs use separate destinations and never replace large category banners',()=>{
 const colors=load('src/lib/stone-colors.ts'),images=load('src/lib/home-images.ts',{'./stone-colors':colors})
 const banners=[{slot:'category',cta:'Explorar',href:'/orelha',image_desktop:'/old.webp'},{slot:'category',cta:'home-mini-v1',href:'/categoria/argolas',image_desktop:'/mini.webp'},{slot:'category',cta:'home-stone-v1',href:'/cores/verde',image_desktop:'/green.webp'}]
 assert.equal(images.homeImageMap(banners,'mini')['/categoria/argolas'],'/mini.webp');assert.equal(images.homeImageMap(banners,'stone')['/cores/verde'],'/green.webp');assert.equal(images.bannerPlacement(banners[0]),'category')
 const view=renderer('src/components/home/StoneColorCarousel.tsx',{'next/link':{default:'Link'},'next/image':{default:'Image'},'lucide-react':{ChevronLeft:'Prev',ChevronRight:'Next'}})
 const tree=view.render({colors:[{id:'verde',name:'Verde',color:'#00ff00',image:'/green.webp'}]});assert.equal(nodes(tree,node=>node.type==='Image')[0].props.src,'/green.webp')
})
test('included-stem copy removes only explicit outdated sale exclusions and preserves care and material guidance',()=>{
 const {rewriteStemDescription}=load('src/lib/stem-description.ts')
 const result=rewriteStemDescription('Titânio ASTM F136. Venda exclusiva do Topo. Haste (base anatômica) não inclusa e deve ser adicionada separadamente ao carrinho. Consulte seu piercer. Haste vendida separadamente. Peça avulsa, não acompanha haste.')
 assert.ok(!/não inclusa|vendida separadamente|não acompanha haste|exclusiva do Topo/i.test(result));assert.match(result,/ASTM F136/);assert.match(result,/Consulte seu piercer/)
})

test('legacy description variants no longer advertise an extra shaft purchase',()=>{
 const rewrite=load('src/lib/stem-description.ts').rewriteStemDescription
 const cases=['Haste labret não inclusa','haste (vendida separadamente)','haste, vendida separadamente','haste labret (vendida separadamente)','Apenas Topo (Necessita de haste com rosca interna, adquirida separadamente)','Por não acompanhar a haste base, permite combinações.']
 for(const value of cases)assert.ok(!/não inclusa|vendida separadamente|adquirida separadamente|não acompanhar|Apenas Topo/i.test(rewrite(value)))
})
test('sterilization remains free, keeps choices distinct, shares stock, and survives shaft changes',()=>{
 const store=cart();store.getState().applyCommercePolicy({...policy,preparation_options:true})
 assert.equal(store.getState().addItem(product,1,{},undefined,'6',true),true)
 assert.equal(store.getState().addItem(product,1,{},undefined,'6',false),true)
 assert.equal(store.getState().items.length,2)
 assert.equal(store.getState().addItem(product,1,{},undefined,'6',true),false)
 assert.equal(store.getState().total(),174)
 const key=store.getState().items.find(x=>x.sterilized).variantKey
 store.getState().setStem(key,'8')
 assert.equal(store.getState().items.find(x=>x.sterilized).stem,'8')
 store.getState().setStem(store.getState().items.find(x=>x.sterilized).variantKey,'6')
 store.getState().setSterilized(store.getState().items.find(x=>x.sterilized).variantKey,false)
 assert.equal(store.getState().items.length,1);assert.equal(store.getState().items[0].quantity,2)
 const {validateCheckoutLines}=load('src/lib/checkout.ts')
 assert.equal(validateCheckoutLines([{slug:'top',variant:'',quantity:1,color:'',stem:'6',sterilized:true}])[0].sterilized,true)
 assert.throws(()=>validateCheckoutLines([{slug:'top',variant:'',quantity:1,color:'',sterilized:'yes'}]))
})
test('microdermal tops and bases stop inheriting mandatory labret shaft lengths only after preparation installation',()=>{
 const store=cart();const micro={...product,name:'TN1072 Topo Microdermal 1.6mm',slug:'micro',preparationOptions:true,includesStem:false}
 store.getState().applyCommercePolicy({...policy,preparation_options:true})
 assert.equal(store.getState().addItem(micro,1,{},undefined,undefined,true),true)
 assert.equal(store.getState().items[0].requiresStem,undefined)
 assert.equal(store.getState().addItem(micro,1,{},undefined,'6',true),false)
 assert.equal(commerce.isMicrodermalTop({name:'TN1390 Base Microdermal Para Topos 1.2mm'}),false)
 assert.equal(commerce.isMicrodermalTop(micro),true)
})

test('paid sterilization adds exactly five per selected piece across toggles, quantity, policy refresh and canonical quotes',()=>{
 const store=cart(),paid={...policy,version:10,preparation_options:true,sterilization_all_products:true,sterilization_fee:5}
 store.getState().applyCommercePolicy(paid)
 assert.equal(store.getState().addItem(product,2,{},undefined,'6',true),true)
 let item=store.getState().items[0]
 assert.equal(item.price,92);assert.equal(item.sterilizationFee,5);assert.equal(store.getState().total(),184)
 store.getState().applyCommercePolicy(paid);assert.equal(store.getState().total(),184)
 store.getState().setSterilized(item.variantKey,false);assert.equal(store.getState().total(),174)
 item=store.getState().items[0];store.getState().setSterilized(item.variantKey,true);assert.equal(store.getState().total(),184)
 item=store.getState().items[0]
 store.getState().applyCanonicalQuote([{slug:'top',cart_variant:'',sterilized:true,sterilization_fee:5,stem:'6',stem_fee:5,color:'',quantity:2,unit_price:82,fee:0}])
 assert.equal(store.getState().total(),184);assert.ok(store.getState().items[0].variants['Esterilização solicitada'].includes('5,00'))
 const accessory={...product,id:'care',slug:'care',name:'Estojo de joias',includesStem:false,preparationOptions:true,preparationAllProducts:true,sterilizationFee:5}
 assert.equal(store.getState().addItem(accessory,1,{},undefined,undefined,true),true)
})

test('ten-real sterilization and five-real shaft remain separate, merge correctly and reprice canonical totals once',()=>{
 const store=cart(),state=()=>store.getState()
 state().applyCommercePolicy({...policy,version:2,preparation_options:true,sterilization_all_products:true,sterilization_fee:10,stem_fee:5})
 const piece={...product,stock:null,sterilizationFee:10,stemFee:5,preparationOptions:true}
 assert.equal(state().addItem(piece,2,{},undefined,'6',true),true)
 assert.equal(state().items[0].price,97)
 state().setStem(state().items[0].variantKey,'8');assert.equal(state().items[0].price,97)
 state().setSterilized(state().items[0].variantKey,false);assert.equal(state().items[0].price,87)
 state().setSterilized(state().items[0].variantKey,true);assert.equal(state().items[0].price,97)
 state().applyCommercePolicy({...policy,version:3,preparation_options:true,sterilization_all_products:true,sterilization_fee:10,stem_fee:5});assert.equal(state().items[0].price,97)
 state().applyCanonicalQuote([{slug:'top',cart_variant:'',stem:'8',sterilized:true,color:'',quantity:2,unit_price:80,fee:0,sterilization_fee:10,stem_fee:5}]);assert.equal(state().items[0].price,95)
 assert.equal(state().total(),190)
})

test('stem choice shows top-only or complete and reveals only 6/8mm for complete',()=>{
 const view=renderer('src/components/product/StemChoice.tsx',{'next/image':{default:'Image'},'@/lib/commerce':commerce,'lucide-react':{Layers:'Layers',Ruler:'Ruler'}})
 let selected='';let tree=view.render({value:selected,onChange:value=>{selected=value}})
 assert.equal(nodes(tree,node=>node.type==='select').length,0)
 const radios=nodes(tree,node=>node.type==='input')
 assert.equal(radios[0].props.checked,true)
 radios[1].props.onChange();assert.equal(selected,'6')
 tree=view.render({value:selected,onChange:value=>{selected=value}})
 const lengthElement=nodes(tree,node=>typeof node.type==='function' && node.type.name==='StemLengthChoice')[0]
 const lengthTree=lengthElement.type(lengthElement.props)
 assert.deepEqual(nodes(lengthTree,node=>node.type==='input').map(node=>node.props.value),['6','8'])
 nodes(lengthTree,node=>node.type==='input' && node.props.value==='8')[0].props.onChange()
 assert.equal(selected,'8')
 nodes(tree,node=>node.type==='input')[0].props.onChange();assert.equal(selected,'')
})

test('sterilization cards keep the selection explicit and display the current per-piece fee',()=>{
 const view=renderer('src/components/product/SterilizationOptions.tsx',{'lucide-react':{ShieldCheck:'ShieldCheck',Info:'Info'},'@/lib/data':data,'@/lib/commerce':commerce})
 let selected=false
 const props={value:false,fee:10,onChange:value=>{selected=value}}
 let tree=view.render(props)
 const radios=nodes(tree,node=>node.type==='input')
 assert.deepEqual(radios.map(node=>node.props.checked),[true,false])
 assert.match(JSON.stringify(tree),/10,00/)
 radios[1].props.onChange();assert.equal(selected,true)
 tree=view.render({...props,value:selected,disabled:true})
 assert.equal(nodes(tree,node=>node.type==='fieldset')[0].props.disabled,true)
 assert.deepEqual(nodes(tree,node=>node.type==='input').map(node=>node.props.checked),[false,true])
})
