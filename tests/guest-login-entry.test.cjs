const {test}=require('node:test')
const assert=require('node:assert/strict')
const {load}=require('./helpers/load.cjs')
const {nodes}=require('./helpers/render.cjs')
const jsx=(type,props)=>({type,props})
function page(enabled,retorno='checkout'){
 const server=load('src/app/minha-conta/entrar/page.tsx',{
  'react/jsx-runtime':{jsx,jsxs:jsx},'./LoginClient':{default:'LoginClient'},
  '@/lib/guest-checkout':{guestCheckoutEnabled:()=>enabled},
 }).default({searchParams:{retorno}})
 const client=load('src/app/minha-conta/entrar/LoginClient.tsx',{
  'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'Link'},
  'react-dom':{useFormState:()=>[{error:''},()=>{}],useFormStatus:()=>({pending:false})},'./actions':{},
 }).default(server.props)
 return {server,client}
}
test('checkout login offers a full navigation back to guest checkout when enabled on the server',()=>{
 const {server,client}=page(true)
 assert.equal(server.props.guestEnabled,true)
 const links=nodes(client,n=>n.type==='a'&&n.props.href==='/checkout')
 assert.equal(links.length,1)
 assert.equal(links[0].props.children,'Continuar compra sem cadastro')
 assert.equal(nodes(client,n=>n.type==='form').length,1)
 assert.doesNotMatch(JSON.stringify(client),/Entre ou crie sua conta para finalizar/)
})
test('account login and disabled guest checkout do not promise an unavailable guest path',()=>{
 for(const [enabled,retorno] of [[false,'checkout'],[true,'account']]){
  const {client}=page(enabled,retorno)
  assert.equal(nodes(client,n=>n.type==='a'&&n.props.href==='/checkout').length,0)
 }
})
