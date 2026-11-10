export function legacySearch(value: unknown): string {
 return typeof value==='string'?value.replace(/[^a-zA-Z0-9À-ÿ @.-]/g,' ').replace(/\s+/g,' ').trim().slice(0,100):''
}
export function legacySearchFilter(search: string, customers=false): string {
 if(!search) return ''
 if(/^[1-9][0-9]{0,14}$/.test(search)) return customers ? `or(old_id.eq.${search},phone.ilike.%${search}%)` : `old_id.eq.${search}`
 const fields=customers?['name','email','phone']:['payload->>primeiro_nome','payload->>sobrenome','payload->>email','payload->>entrega_primeiro_nome','payload->>entrega_sobrenome']
 return `and(${search.split(' ').slice(0,12).map(token=>`or(${fields.map(field=>`${field}.ilike.%${token}%`).join(',')})`).join(',')})`
}
export function legacyHistoryHref({search='',customers=false,page=1,order=''}:{search?:string;customers?:boolean;page?:number;order?:string}={}) {
 const params=new URLSearchParams()
 if(search)params.set('q',search)
 if(customers)params.set('clientes','1')
 if(page>1)params.set('page',String(page))
 if(order)params.set('pedido',order)
 return '/admin/historico'+(params.size?'?'+params.toString():'')
}
