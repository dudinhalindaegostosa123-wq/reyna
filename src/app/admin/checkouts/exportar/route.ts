import {NextRequest,NextResponse} from 'next/server'
import {adminDatabase} from '@/lib/admin-auth'
import {readCheckoutReport} from '@/lib/checkout-report'
import {checkoutEmailsCsv} from '@/lib/checkout-csv'
export const dynamic='force-dynamic'
export const runtime='nodejs'
export const maxDuration=60
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'}
export async function GET(request:NextRequest){
 // Keep authentication redirects outside the export error handler.
 const {db}=await adminDatabase()
 const params=new URL(request.url).searchParams
 try{
  const report=await readCheckoutReport(db,{
   ambiente:params.get('ambiente') || undefined,numero:params.get('numero') || undefined,
   tentativa:params.get('tentativa') || undefined,concluidos:params.get('concluidos') || undefined,
  },true)
  if(report.contactError || report.contextError || report.numberError || report.relatedError)throw Error('CHECKOUT_EXPORT_INCOMPLETE')
  const csv=checkoutEmailsCsv(report.rows)
  return new NextResponse(csv,{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="emails-checkouts-${report.environment==='test'?'teste':'producao'}.csv"`}})
 }catch{return new NextResponse('Não foi possível gerar o CSV completo. Volte à consulta e tente novamente.',{status:503,headers})}
}
