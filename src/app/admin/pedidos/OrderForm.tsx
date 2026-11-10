'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import StemChoice from '@/components/product/StemChoice'
import { ANODIZATION_COLORS } from '@/lib/anodization'
import { saleAmount, saleMoney } from '@/lib/admin-sales'
import type { Customer,SaleLine,SaleOption } from '@/lib/admin-sales'
import { saveManualOrder,searchOrderProducts } from './actions'

const field = 'mt-1 min-h-[44px] w-full rounded-xl border border-[#DCD4C8] bg-white px-3 py-2 text-base sm:text-sm'
const numeric = (value:string) => { try { return saleAmount(value) } catch { return 0 } }

export default function OrderForm({customers,anodizationFee=15}:{customers:Customer[];anodizationFee?:number}) {
  const router = useRouter()
  const [pending,setPending] = useState(false)
  async function start(task:()=>Promise<void>) {setPending(true);try {await task()} finally {setPending(false)}}
  const [requestId] = useState(() => crypto.randomUUID())
  const [options,setOptions] = useState<SaleOption[]>([])
  const [items,setItems] = useState<SaleLine[]>([])
  const [query,setQuery] = useState('')
  const [message,setMessage] = useState('')
  const [discount,setDiscount] = useState('0')
  const [shipping,setShipping] = useState('0')
  const [expenses,setExpenses] = useState('0')
  const subtotal = items.reduce((sum,item) => sum+(numeric(item.unit_price)+(item.color ? anodizationFee : 0))*Number(item.quantity || 0),0)
  function change(index:number,key:'quantity'|'unit_price'|'color'|'stem',value:string) { setItems(rows => rows.map((row,i) => i === index ? {...row,[key]:value} : row)) }
  return <form onSubmit={event => {
    event.preventDefault();setMessage('')
    const form = new FormData(event.currentTarget)
    start(async () => {
      try {
        const result = await saveManualOrder({id:requestId,customer:String(form.get('customer') || ''),status:String(form.get('status')),discount,shipping,expenses,notes:String(form.get('notes') || ''),expected_fee:anodizationFee,items:items.map(({product_id,variant_id,quantity,unit_price,color,stem})=>({product_id,variant_id,quantity,unit_price,color,...(stem?{stem}:{})}))})
        if (result.error || !result.id) {setMessage(result.error || 'Não foi possível salvar.');return}
        router.push(`/admin/pedidos/${result.id}`);router.refresh()
      } catch {setMessage('A conexão falhou. Tente salvar novamente; o mesmo pedido não será duplicado.')}
    })
  }}>
    <fieldset disabled={pending} className="space-y-6 disabled:opacity-60">
      <div className="rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7">
        <h2 className="mb-4 text-lg font-medium">Cliente e situação</h2>
        <div className="grid gap-4 md:grid-cols-2"><label className="text-xs">Cliente cadastrado<select required name="customer" defaultValue="" className={field}><option value="">Selecione</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}</select></label><label className="text-xs">Situação<select name="status" className={field}><option value="pending">Pendente de pagamento</option><option value="paid">Pago — pagamento já conferido</option></select></label></div>
        <Link href="/admin/clientes" className="mt-3 inline-block text-xs underline underline-offset-4">Cadastrar cliente antes de montar o pedido</Link>
      </div>
      <div className="rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7">
        <h2 className="mb-4 text-lg font-medium">Peças do pedido</h2>
        <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-xs">Buscar por nome ou SKU<input value={query} onChange={e => setQuery(e.target.value)} className={field} maxLength={100} placeholder="Ex.: TN883" /></label><button type="button" className="min-h-[44px] rounded-full bg-[#292621] px-6 text-sm text-white" onClick={() => {setMessage('');start(async()=>{try {const result=await searchOrderProducts(query);setOptions(result.options);setMessage(result.error)} catch {setMessage('Falha na busca. Tente novamente.')}})}}>Buscar peças</button></div>
        {options.length > 0 && <label className="mt-4 block text-xs">Escolha o produto ou a variação<select value="" className={field} onChange={e=>{const item=options[Number(e.target.value)];if(!item)return;setItems(rows=>[...rows,{...item,quantity:'1',unit_price:item.price === null ? '' : String(item.price),color:'',stem:item.stem_length || ''}]);setOptions([])}}><option value="">Adicionar uma peça ao pedido</option>{options.map((item,i)=><option key={`${item.product_id}-${item.variant_id}`} value={i}>{item.name} · {item.price === null ? 'Informar preço' : saleMoney(item.price)}</option>)}</select><span className="mt-2 block text-[#81796C]">Resultados limitados. Para localizar uma variação, use o código da peça.</span></label>}
        <div className="mt-5 space-y-4">{items.map((item,index)=><article key={index} className="rounded-2xl border border-[#E5DED3] bg-[#FCFBF8] p-4"><div className="flex items-start justify-between gap-4"><h3 className="text-sm font-medium">{item.name}</h3><button type="button" aria-label={`Remover ${item.name}`} onClick={()=>setItems(rows=>rows.filter((_,i)=>i!==index))} className="text-xs underline">Remover</button></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs">Quantidade<input required type="number" min="1" max="9999" step="1" value={item.quantity} onChange={e=>change(index,'quantity',e.target.value)} className={field} /></label><label className="text-xs">Preço unitário sem anodização<input required inputMode="decimal" value={item.unit_price} onChange={e=>change(index,'unit_price',e.target.value)} className={field} /></label>{item.anodizable && <label className="text-xs">Anodização<select value={item.color} onChange={e=>change(index,'color',e.target.value)} className={field}><option value="">Cor original</option>{ANODIZATION_COLORS.map(c=><option key={c.code} value={c.code}>{c.label} · {c.voltage} V {anodizationFee===0?'(gratuita)':`(+ ${saleMoney(anodizationFee)})`}</option>)}</select></label>}</div>{item.includes_stem && !item.stem_length && <StemChoice value={item.stem || ''} onChange={value=>change(index,'stem',value)} disabled={pending} />}<p className="mt-3 text-right text-sm">{saleMoney((numeric(item.unit_price)+(item.color ? anodizationFee : 0))*Number(item.quantity || 0))}</p></article>)}</div>
        {!items.length && <p className="py-8 text-center text-sm text-[#81796C]">Busque e adicione a primeira peça.</p>}
      </div>
      <div className="rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7"><h2 className="mb-4 text-lg font-medium">Valores e observações</h2><div className="grid gap-4 sm:grid-cols-3">{[['Desconto nos produtos',discount,setDiscount],['Frete cobrado',shipping,setShipping],['Despesas da venda',expenses,setExpenses]].map(([label,value,setter])=><label key={String(label)} className="text-xs">{String(label)}<input required inputMode="decimal" className={field} value={String(value)} onChange={e=>(setter as (value:string)=>void)(e.target.value)} /></label>)}</div><p className="mt-3 text-xs leading-relaxed text-[#81796C]">Despesas: taxas, embalagem, custo da anodização e outras despesas desta venda. O frete cobrado fica separado da margem dos produtos; inclua aqui apenas eventual diferença de frete paga pela loja.</p><label className="mt-4 block text-xs">Observações internas<textarea name="notes" maxLength={2000} rows={3} className={field} /></label><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DED3] pt-5"><span className="text-sm">Produtos: {saleMoney(subtotal)}</span><strong className="text-xl">Total: {saleMoney(subtotal-numeric(discount)+numeric(shipping))}</strong></div></div>
      <p className="text-xs leading-relaxed text-[#81796C]">Pedido pendente reserva as peças por 30 minutos. Confirmar pagamento dá baixa no saldo cadastrado. O painel não realiza cobrança nem envia mensagens nesta etapa.</p>
      <button disabled={!items.length || !customers.length} className="min-h-[48px] rounded-full bg-[#292621] px-8 text-sm text-white disabled:opacity-40">{pending ? 'Salvando…' : 'Salvar pedido'}</button>
    </fieldset>
    {message && <p role="alert" className="mt-4 text-sm text-[#8B3E2F]">{message}</p>}
  </form>
}

// Lunarity: estoque e reservas v1
