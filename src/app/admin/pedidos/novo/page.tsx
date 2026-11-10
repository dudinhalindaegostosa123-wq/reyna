import { getCommercePolicy } from '@/lib/commerce-server'
import Link from 'next/link'
import { adminDatabase } from '@/lib/admin-auth'
import type { Customer } from '@/lib/admin-sales'
import OrderForm from '../OrderForm'

export default async function NewOrderPage() {
  const {db} = await adminDatabase()
  const commerce=await getCommercePolicy()
  const customers:Customer[] = []
  for (let offset=0;;offset+=1000) {
    const {data,error}=await db.from('serenity_customers').select('id,name,email,phone,notes').order('name').order('id').range(offset,offset+999)
    if(error)throw new Error('ADMIN_CUSTOMERS_QUERY')
    customers.push(...(data || []));if(!data || data.length<1000)break
  }
  return <main className="mx-auto max-w-5xl px-5 py-8"><Link href="/admin/pedidos" className="text-xs underline">← Voltar aos pedidos</Link><h1 className="mb-2 mt-5 text-3xl font-medium tracking-tight">Novo pedido manual</h1><p className="mb-7 text-sm text-[#81796C]">Registre uma venda feita pelo atendimento ou pessoalmente.</p><OrderForm customers={customers} anodizationFee={commerce.anodization_fee} /></main>
}
