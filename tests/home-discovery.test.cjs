const {test}=require('node:test'),assert=require('node:assert/strict'),{load}=require('./helpers/load.cjs'),{nodes}=require('./helpers/render.cjs')
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'}
const api=load('src/components/home/CategoryDiscoveryGrid.tsx',{'react/jsx-runtime':jsx,'next/link':{default:'Link'},'next/image':{default:'Image'}})
const items=[['Orelha','/orelha'],['Nariz','/nariz'],['Boca','/boca'],['Umbigo','/categoria/umbigo'],['Sobrancelha','/categoria/sobrancelha'],['Microdermal','/categoria/microdermal'],['Mamilo','/categoria/mamilo'],['Íntimos','/intimos']].map(([name,href])=>({name,href,subtitle:'Descrição '+name,image:'/photo.webp',mobileImage:'/mobile.webp'}))
function expand(tree){
 if(tree==null || typeof tree!=='object')return tree
 if(Array.isArray(tree))return tree.map(expand)
 if(typeof tree.type==='function')return expand(tree.type(tree.props))
 return {...tree,props:{...tree.props,children:expand(tree.props.children)}}
}
test('discovery features ear, nose and navel while retaining every configured category exactly once',()=>{
 const layout=api.arrangeDiscoveryBanners([...items,items[0],{...items[0],href:'/orelha/'}])
 assert.deepEqual(Array.from(layout.featured,item=>item.href),['/orelha','/nariz','/categoria/umbigo'])
 const all=[...layout.featured,...layout.more]
 assert.equal(all.length,items.length)
 assert.equal(new Set(all.map(item=>item.href)).size,items.length)
 assert.equal(layout.more.length,5)
})
test('banner grid keeps working links and mobile photos without numbered or starred overlays',()=>{
 const tree=expand(api.default({items}))
 assert.equal(nodes(tree,n=>n.type==='Link').length,9)
 assert.equal(nodes(tree,n=>n.type==='Image').length,8)
 assert.equal(nodes(tree,n=>n.type==='source' && n.props.srcSet==='/mobile.webp').length,8)
 assert.equal(nodes(tree,n=>n.props.className==='lunarity-discovery-index').length,0)
 assert.ok(!JSON.stringify(tree).includes('✧'))
 for(const item of items)assert.equal(nodes(tree,n=>n.type==='Link' && n.props.href===item.href).length,1)
})
test('empty, single, two and custom category setups do not invent missing banners or break links',()=>{
 assert.equal(api.default({items:[]}),null)
 for(const count of [1,2]){
  const tree=expand(api.default({items:items.slice(0,count)}))
  assert.equal(nodes(tree,n=>n.props['data-count']===count).length,1)
  assert.equal(nodes(tree,n=>n.type==='Image').length,count)
 }
 const tree=expand(api.default({items:[{name:'Minha seleção',href:'/categoria/selecao',subtitle:'Minha descrição'}]}))
 assert.equal(nodes(tree,n=>n.type==='Image').length,0)
 assert.equal(nodes(tree,n=>n.type==='Link' && n.props.href==='/categoria/selecao').length,1)
})
