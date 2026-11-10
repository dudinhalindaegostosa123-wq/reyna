'use server'

import { redirect } from 'next/navigation'
import { adminDatabase } from '@/lib/admin-auth'
import { reconcilePaymentAttempt, paymentFailureCode } from '@/lib/payment-processing-server'

export async function reconcileAdminPayment(form: FormData) {
  const { db } = await adminDatabase()
  let result = 'atualizado'
  try {
    const response = await reconcilePaymentAttempt(db, String(form.get('attempt') || ''), 'admin')
    if (!response.found) result = 'nao-localizado'
    else if (response.review) result = 'conferencia'
  } catch (error) {
    console.error('[payment-admin]', { code: paymentFailureCode(error) })
    result = 'falha'
  }
  redirect(`/admin/pagamentos?aviso=${result}`)
}

export async function reconcileRecentAdminPayments() {
  const { db } = await adminDatabase()
  const started=Date.now()
  const found=await db.from('serenity_checkout_payments_v2').select('id')
    .eq('environment','production').in('state',['submitting','pending','uncertain','approved'])
    .neq('application_state','applied').neq('application_state','test_approved')
    .gte('created_at',new Date(started-72*60*60*1000).toISOString())
    .order('state',{ascending:true})
    .order('last_reconciled_at',{ascending:true,nullsFirst:true})
    .order('created_at',{ascending:true}).limit(20)
  let checked=0,reviews=0,failed=0
  if(found.error) redirect('/admin/pagamentos?aviso=falha')
  for(const row of found.data || []){
    if(Date.now()-started>25000)break
    try{
      const result=await reconcilePaymentAttempt(db,row.id,'admin')
      checked++
      if(result.review)reviews++
    }catch(error){failed++;console.error('[payment-admin]',{code:paymentFailureCode(error)})}
    const saved=await db.from('serenity_checkout_payments_v2').update({last_reconciled_at:new Date().toISOString()}).eq('id',row.id)
    if(saved.error){failed++;break}
  }
  redirect(`/admin/pagamentos?aviso=lote&consultados=${checked}&conferir=${reviews}&falhas=${failed}`)
}
