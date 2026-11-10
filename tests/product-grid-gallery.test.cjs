const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{nodes}=require('./helpers/render.cjs')
function fixture(touch=false,reduced=false,pricing={}){
 let cursor=0,effects=[],hooks=[],intervals=new Map(),next=0,observer,hidden=false,listeners={}
 const media=q=>({matches:q.includes('reduced')?reduced:touch,addEventListener(){},removeEventListener(){}})
 const react={useRef:value=>{const i=cursor++;return hooks[i] ||= {current:value}},useState:value=>{const i=cursor++;if(!(i in hooks))hooks[i]=value;return [hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v]},useTransition:()=>[false,fn=>fn()],useEffect:(fn,deps)=>{const i=cursor++,old=hooks[i];if(!old || deps.some((v,j)=>!Object.is(v,old.deps[j]))){effects.push(()=>{old?.cleanup?.();hooks[i].cleanup=fn()});hooks[i]={deps}}}}
 const api=load('src/components/ui/ProductCard.tsx', {react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'next/image':{default:'Image'},'next/link':{default:'Link'},'next/navigation':{useRouter:()=>({prefetch(){},push(){}})},'@/lib/product-copy':{commercialProductName:x=>x,productReference:()=>''},'@/lib/promotion':load('src/lib/promotion.ts'),'@/lib/data':{formatPrice:x=>String(x)},clsx:{default:(...xs)=>xs.filter(Boolean).join(' ')}},{},{window:{matchMedia:media},document:{get hidden(){return hidden},addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:name=>delete listeners[name]},IntersectionObserver:class{constructor(fn){observer=fn}observe(){}disconnect(){}},setInterval:(fn,ms)=>{assert.equal(ms,3000);intervals.set(++next,fn);return next},clearInterval:id=>intervals.delete(id)})
 const product={slug:'labret',name:'Labret',images:['/a.webp','/b.webp','/c.webp'],price:100,category:'Labret',...pricing}
 const render=()=>{cursor=0;const tree=api.default({product});tree.props.ref.current={};return tree}
 const flush=()=>{const pending=effects;effects=[];pending.forEach(fn=>fn())}
 return {replaceImages:images=>{product.images=images},render,flush,visible:value=>observer([{isIntersecting:value}]),tick:()=>[...intervals.values()].forEach(fn=>fn()),active:()=>intervals.size,hide:()=>{hidden=true;listeners.visibilitychange?.()}}
}
test('mobile gallery rotates every three seconds only while visible and pauses when the tab is hidden',()=>{
 const view=fixture(true);let tree=view.render();view.flush();view.visible(true);assert.equal(view.active(),1)
 view.tick();tree=view.render();assert.equal(nodes(tree,n=>n.type==='Image')[0].props.src,'/b.webp')
 view.visible(false);assert.equal(view.active(),0);view.visible(true);view.hide();assert.equal(view.active(),0)
})
test('desktop gallery starts on hover, returns to cover on leave, and reduced-motion disables the timer',()=>{
 const view=fixture();let tree=view.render();view.flush();view.visible(true);assert.equal(view.active(),0)
 tree.props.onMouseEnter();tree=view.render();view.flush();view.visible(true);assert.equal(view.active(),1)
 tree=view.render();assert.equal(nodes(tree,n=>n.type==='Image')[0].props.src,'/b.webp')
 view.tick();tree=view.render();assert.equal(nodes(tree,n=>n.type==='Image')[0].props.src,'/c.webp')
 tree.props.onMouseLeave();tree=view.render();view.flush();assert.equal(view.active(),0);tree=view.render();assert.equal(nodes(tree,n=>n.type==='Image')[0].props.src,'/a.webp')
 const reduced=fixture(true,true);reduced.render();reduced.flush();reduced.visible(true);assert.equal(reduced.active(),0)
})

test('a parent rerender with identical photos does not reset the mobile timer or current photo',()=>{
 const view=fixture(true);view.render();view.flush();view.visible(true)
 view.tick();view.render();view.flush()
 view.replaceImages(['/a.webp','/b.webp','/c.webp']);view.render();view.flush()
 assert.equal(view.active(),1)
 view.tick();const tree=view.render();assert.equal(nodes(tree,n=>n.type==='Image')[0].props.src,'/c.webp')
 view.tick();assert.equal(nodes(view.render(),n=>n.type==='Image')[0].props.src,'/a.webp')
})

test('the next photo is present for lazy loading before the first hover',()=>{
 const view=fixture();const tree=view.render()
 const preload=nodes(tree,n=>n.type==='Image' && n.props['aria-hidden']==='true')[0]
 assert.equal(preload.props.src,'/b.webp');assert.equal(preload.props.loading,'lazy')
})

 test('promotion card shows the original price first, the current price and the matching OFF badge',()=>{
  const tree=fixture(false,false,{price:16,originalPrice:25,isFeatured:true}).render()
  const labels=nodes(tree,n=>n.props?.['aria-label'])
  assert.equal(labels.find(n=>n.props['aria-label']==='36% de desconto').props.children.join(''),'36% OFF')
  const prices=labels.filter(n=>['Preço anterior','Preço atual'].includes(n.props['aria-label']))
  assert.equal(prices[0].type,'del');assert.equal(prices[0].props.children,'25')
  assert.equal(prices[1].props['aria-label'],'Preço atual')
  assert.doesNotMatch(JSON.stringify(tree),/Destaque/)
  for(const pricing of [{price:25,originalPrice:25},{price:16},{price:16,originalPrice:25,priceAvailable:false}]){
   const plain=fixture(false,false,pricing).render()
   assert.equal(nodes(plain,n=>n.type==='del').length,0)
   assert.doesNotMatch(JSON.stringify(plain),/% OFF|% de desconto/)
  }
 })
test('out-of-stock cards keep the product link, show unavailable/notify and suppress every price and discount',()=>{
 const tree=fixture(false,false,{price:16,originalPrice:25,inStock:false,isFeatured:true}).render()
 assert.equal(tree.props.href,'/produto/labret')
 assert.equal(nodes(tree,n=>n.type==='del' || n.props['aria-label']==='Preço atual').length,0)
 assert.match(JSON.stringify(tree),/Indisponível/);assert.match(JSON.stringify(tree),/Avise-me/);assert.doesNotMatch(JSON.stringify(tree),/% OFF/)
 assert.match(nodes(tree,n=>n.type==='Image')[0].props.className,/grayscale/)
})
