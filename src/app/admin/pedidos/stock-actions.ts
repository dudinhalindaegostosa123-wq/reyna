'use server'
import { revalidatePath,revalidateTag } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { saleUuid } from '@/lib/admin-sales'

export async function manageOrderStock(id:string,version:string,command:string):Promise<{error:string}> {
  const {db,user}=await adminDatabase()

  if(!saleUuid(id)||typeof version!=='string'||version.length>50||!Number.isFinite(Date.parse(version))||!['reserve','release','return'].includes(command))return {error:'Confira o pedido e atualize a página.'}

  const {error}=await db.rpc('serenity_admin_stock_action',{
    p_order:id,
    p_expected:version,
    p_command:command,
    p_actor:user.id
  })

  if(error){
    if(/STOCK_RESERVED|STOCK_UNAVAILABLE/.test(error.message))return {error:'Não há saldo livre suficiente. Confira as quantidades e as reservas de outros pedidos.'}
    if(error.message.includes('STOCK_CONTROL_CHANGED'))return {error:'O controle de quantidade desta peça mudou. Confira o saldo no cadastro antes de devolver ao estoque.'}
    if(error.message.includes('STALE_ORDER'))return {error:'Este pedido mudou em outra tela. Atualize a página para conferir.'}
    return {error:'Não foi possível concluir. Confira a situação do pedido e atualize a página.'}
  }

  revalidatePath('/admin/produtos');revalidatePath('/admin/produtos/[id]','page');revalidateTag('catalog')
  revalidatePath('/admin/pedidos')
  revalidatePath(`/admin/pedidos/${id}`)

  return {error:''}
}

// Lunarity: estoque geral das variações v2
