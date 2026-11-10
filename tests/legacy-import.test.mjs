import {test} from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
const script=String.raw`
import sys,importlib.util,json
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('legacy','scripts/prepare-legacy-import.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
u={'id_antigo':'1','email':'owner@example.com','nome_exibido':'Owner','primeiro_nome':'','sobrenome':'','telefone':'NULL','perfil_antigo':'a:1:{s:8:"customer";b:1;}'}
a={**u,'id_antigo':'2','email':'admin@example.com','perfil_antigo':'a:1:{s:13:"administrator";b:1;}'}
o={'pedido_antigo':'10','pedido_pai':'0','tipo':'shop_order','situacao':'wc-completed','moeda':'BRL','criado_em_utc':'2025-01-01 00:00:00','usuario_antigo':'1','email':'owner@example.com','total':'100'}
i={'pedido_antigo':'10','item_antigo':'20','tipo_item':'line_item','nome':'Joia','quantidade':'1','subtotal':'110','total':'100','imposto':'0','custo_frete':'','desconto_cupom':''}
b=m.prepare([u,a],[o],[i]);assert len(b['customers'])==1;assert b['customers'][0]['phone']=='';assert b['orders'][0]['owner_email']=='owner@example.com';assert b['orders'][0]['created_at'].endswith('+00:00')
b=m.prepare([u],[{**o,'email':'another@example.com'}],[i]);assert b['orders'][0]['needs_review'];assert b['orders'][0]['owner_email'] is None
for users,orders,items in [([u],[o],[{**i,'total':'90'}]),([u,u],[o],[i]),([u],[o],[i,i]),([{**u,'user_pass':'NEVER'}],[o],[i])]:
 try:m.prepare(users,orders,items)
 except ValueError:pass
 else:raise AssertionError('Unsafe export accepted')
print('ok')
`
test('private CSV preparation filters administrators, preserves amounts, quarantines mismatches and rejects unsafe data',()=>{
 const output=execFileSync('python3',['-c',script],{cwd:new URL('..',import.meta.url),encoding:'utf8'})
 assert.equal(output.trim(),'ok')
})
