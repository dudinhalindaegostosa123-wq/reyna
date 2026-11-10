type Row = Record<string, string>
interface HistoricalOrder {old_id:number;parent_id:number|null;kind:string;status:string;created_at:string;total:string;currency:string;payload:Row;owner_email:string|null;needs_review:boolean;visible:boolean}
const empty = (value: string | undefined) => value == null || value === '' || value === 'NULL'

export function parseLegacyCsv(input: string): Row[] {
  const source = input.replace(/^\uFEFF/, '')
  const first = source.split(/\r?\n/,1)[0]
  const delimiter = [',',';','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0]
  const records: string[][] = []
  let row: string[] = [], value = '', quoted = false, closed = false
  const field = () => { row.push(value); value=''; closed=false }
  const record = () => { field(); if (row.length !== 1 || row[0] !== '') records.push(row); row=[] }
  for (let index=0; index<source.length; index++) {
    const char=source[index]
    if (quoted) {
      if (char==='"') {
        if (source[index+1]==='"') { value+='"'; index++ } else { quoted=false; closed=true }
      } else value+=char
    } else if (char==='"' && value==='' && !closed) quoted=true
    else if (char===delimiter) field()
    else if (char==='\n' || char==='\r') { if(char==='\r' && source[index+1]==='\n') index++; record() }
    else { if(closed || char==='"') throw new Error('CSV com aspas inválidas. Exporte novamente em CSV.'); value+=char }
  }
  if(quoted) throw new Error('CSV incompleto: há um campo sem fechamento de aspas.')
  if(value!=='' || row.length || closed) record()
  const headers=records.shift()
  if(!headers?.length || new Set(headers).size!==headers.length || headers.some(name=>['__proto__','prototype','constructor','user_pass','user_activation_key','session_tokens'].includes(name))) throw new Error('Cabeçalho inválido ou arquivo com dados de senha. Use os CSVs das consultas fornecidas.')
  if(records.length>100000) throw new Error('Arquivo com registros demais para esta importação.')
  return records.map(cells=>{
    if(cells.length!==headers.length) throw new Error('CSV com colunas incompletas. Exporte todos os resultados novamente.')
    const result:Row=Object.create(null)
    headers.forEach((name,index)=>{result[name]=cells[index]})
    return result
  })
}
function required(rows: Row[], columns:string[]) {
  if(!rows.length || columns.some(column=>!(column in rows[0]))) throw new Error('Um dos CSVs está no campo errado ou está vazio. Confira cadastros, pedidos e itens.')
}
function id(value:string,optional=false):number|null {
  if(optional && (empty(value) || value==='0')) return null
  if(!/^[1-9][0-9]*$/.test(value || '') || !Number.isSafeInteger(Number(value))) throw new Error('ID inválido ou duplicado no arquivo.')
  return Number(value)
}
function address(value:string) {
  const normalized=(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized.length<=254?normalized:null
}
// Inteiros com escala de oito casas para validar valores sem erro de ponto flutuante.
function amount(value:string|undefined) {
  if(empty(value)) return BigInt(0)
  const parts=/^(-?)([0-9]{1,13})(?:\.([0-9]{1,8}))?$/.exec(value!)
  if(!parts) throw new Error('Valor monetário inválido no CSV.')
  const result=BigInt(parts[2])*BigInt('100000000')+BigInt((parts[3] || '').padEnd(8,'0'))
  return parts[1]? -result:result
}
function timestamp(value:string) {
  const normalized=(value || '').replace(' ','T')
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(normalized) || !Number.isFinite(Date.parse(normalized+'Z'))) throw new Error('Data inválida no arquivo de pedidos.')
  return normalized+'+00:00'
}
export function buildLegacyBundle(usersText:string,ordersText:string,itemsText:string) {
  const users=parseLegacyCsv(usersText),orders=parseLegacyCsv(ordersText),items=parseLegacyCsv(itemsText)
  required(users,['id_antigo','email','nome_exibido','primeiro_nome','sobrenome','telefone','perfil_antigo'])
  required(orders,['pedido_antigo','pedido_pai','tipo','situacao','moeda','criado_em_utc','usuario_antigo','email','total'])
  required(items,['pedido_antigo','item_antigo','tipo_item','nome','quantidade','total','imposto','custo_frete'])
  if(users.length>10000 || orders.length>20000) throw new Error('Arquivos grandes demais para esta importação.')
  const known=new Map<number,string>(),emails=new Set<string>()
  const customers=users.filter(row=>!['administrator','shop_manager'].some(role=>row.perfil_antigo.includes(`"${role}"`))).map(row=>{
    const old_id=id(row.id_antigo)!,email=address(row.email)
    if(!email || emails.has(email) || known.has(old_id)) throw new Error('Cliente com e-mail inválido ou cadastro duplicado.')
    known.set(old_id,email);emails.add(email)
    return {old_id,email,name:[row.primeiro_nome,row.sobrenome].filter(Boolean).join(' ').trim() || row.nome_exibido.trim(),phone:empty(row.telefone)?'':row.telefone,profile:row}
  })
  const orderMap=new Map<number,HistoricalOrder>()
  const historicalOrders:HistoricalOrder[]=orders.map(row=>{
    const old_id=id(row.pedido_antigo)!,oldUser=id(row.usuario_antigo,true)
    if(orderMap.has(old_id) || !['shop_order','shop_order_refund'].includes(row.tipo) || row.moeda!=='BRL') throw new Error('Pedido duplicado ou tipo/moeda inesperados.')
    amount(row.total)
    let owner_email=address(row.email),needs_review=false
    if(oldUser) {
      if(!known.has(oldUser) || (owner_email && owner_email!==known.get(oldUser))) {owner_email=null;needs_review=true}
      else owner_email=known.get(oldUser)!
    }
    if(!owner_email) needs_review=true
    const result={old_id,parent_id:id(row.pedido_pai,true),kind:row.tipo,status:row.situacao,created_at:timestamp(row.criado_em_utc),total:empty(row.total)?'0':row.total,currency:row.moeda,payload:row,owner_email,needs_review,visible:row.tipo==='shop_order' && !['trash','auto-draft'].includes(row.situacao)}
    orderMap.set(old_id,result)
    return result
  })
  historicalOrders.forEach(order=>{
    if(order.kind==='shop_order_refund') {
      const parent=orderMap.get(order.parent_id || 0)
      if(!parent || parent.kind!=='shop_order') throw new Error('Estorno sem pedido original no arquivo.')
      order.owner_email=parent.owner_email;order.needs_review=parent.needs_review
    }
  })
  const ids=new Set<number>(),totals=new Map<number,bigint>(),products=new Set<number>()
  const historicalItems=items.map(row=>{
    const old_id=id(row.item_antigo)!,order_id=id(row.pedido_antigo)!
    if(ids.has(old_id) || !orderMap.has(order_id) || !['line_item','shipping','coupon','fee','tax'].includes(row.tipo_item)) throw new Error('Item duplicado, sem pedido ou com tipo inesperado.')
    ids.add(old_id)
    if(['line_item','fee'].includes(row.tipo_item)) totals.set(order_id,(totals.get(order_id) || BigInt(0))+amount(row.total)+amount(row.imposto))
    else if(row.tipo_item==='shipping') totals.set(order_id,(totals.get(order_id) || BigInt(0))+amount(row.custo_frete))
    if(row.tipo_item==='line_item') products.add(order_id)
    return {old_id,order_id,kind:row.tipo_item,name:row.nome,payload:row}
  })
  historicalOrders.forEach(order=>{
    const difference=(totals.get(order.old_id) || BigInt(0))-amount(order.total)
    if(order.visible && (!products.has(order.old_id) || difference>BigInt('1000000') || difference < -BigInt('1000000'))) throw new Error(`Pedido antigo #${order.old_id} sem peças ou com valores divergentes. Nenhum dado foi importado.`)
  })
  return {source:'serenity-woocommerce-hpos-v1',customers,orders:historicalOrders,items:historicalItems}
}
