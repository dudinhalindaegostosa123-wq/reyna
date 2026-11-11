const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const { nodes } = require('./helpers/render.cjs')
const jsx = (type, props) => ({ type, props })

function page(userId,enabled=false) {
  return load('src/app/checkout/page.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'next/navigation': { redirect: url => { throw new Error(`REDIRECT:${url}`) } },
    'next/link': { default: 'Link' }, './CheckoutClient': { default: 'Checkout' },
    '@/lib/guest-checkout': { guestCheckoutEnabled:()=>enabled, optionalCheckoutAccess: async () => ({ userId, rules: null }) },
    '@/lib/mercado-pago-server': { mercadoPagoPublicConfig: () => ({ environment: 'production' }) },
    '@/lib/checkout-session-server-v2': { checkoutSessionErrorV2: () => 'Erro' },
  }).default()
}

test('checkout redirects guests before rendering the purchase form and admits authenticated customers', async () => {
  await assert.rejects(page(null), /REDIRECT:\/minha-conta\/entrar\?retorno=checkout/)
  const authenticated = await page('11111111-1111-4111-8111-111111111111')
  assert.equal(nodes(authenticated, n => n.type === 'Link' && n.props.href === '/minha-conta#pedidos').length, 1)
  assert.equal(nodes(authenticated, n => n.type === 'Link' && n.props.href.includes('retorno=checkout')).length, 0)
})

test('successful login returns only to checkout or account; arbitrary redirect destinations are ignored', async () => {
  const api = load('src/app/minha-conta/entrar/actions.ts', {
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect: url => { throw new Error(`REDIRECT:${url}`) } },
    '@/lib/customer-auth': { customerAuth: () => ({ auth: { signInWithPassword: async () => ({ data: { user: { email_confirmed_at: '2026-10-22' } } }) } }) },
    '../cadastrar/actions': { completeCustomerRegistration: async () => ({ error: '' }) },
  })
  for (const [target, expected] of [['/checkout', '/checkout'], ['https://outside.example', '/minha-conta'], ['', '/minha-conta']]) {
    const form = new FormData()
    form.set('email', 'fixture@example.com'); form.set('password', 'fixture-password'); form.set('return_to', target)
    await assert.rejects(api.loginCustomer({ error: '' }, form), error => error.message === `REDIRECT:${expected}`)
  }
})

test('enabled guest checkout renders contact form with optional login and registration',async()=>{
 const guest=await page(null,true)
 assert.equal(nodes(guest,n=>n.type==='Checkout').length,1)
 assert.equal(nodes(guest,n=>n.type==='Link'&&n.props.href==='/minha-conta/entrar?retorno=checkout').length,1)
 assert.equal(nodes(guest,n=>n.type==='Link'&&n.props.href==='/minha-conta/cadastrar?retorno=checkout').length,1)
})

test('Asaas storefront checkout opens without any Mercado Pago configuration',async()=>{
 const jsx=(type,props)=>({type,props})
 const component=load('src/app/checkout/page.tsx',{
  'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'next/navigation':{redirect:()=>{throw Error('unexpected redirect')}},
  'next/link':{default:'Link'},'./CheckoutClient':{default:'Checkout'},
  '@/lib/guest-checkout':{guestCheckoutEnabled:()=>true,optionalCheckoutAccess:async()=>({userId:null})},
  '@/lib/mercado-pago-server':{mercadoPagoPublicConfig:()=>{throw Error('must not use Mercado Pago')}},
  '@/lib/asaas-server':{asaasConfig:()=>({environment:'production'})},
  '@/lib/checkout-session-server-v2':{checkoutSessionErrorV2:e=>e.message},
 },{ASAAS_ENVIRONMENT:'production'})
 assert.equal(nodes(await component.default(),n=>n.type==='Checkout').length,1)
})
