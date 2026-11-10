import Link from 'next/link'
import { adminDatabase } from '@/lib/admin-auth'
import { saleDate, saleMoney } from '@/lib/admin-sales'
import { mercadoPagoConfig, mercadoPagoPublicConfig } from '@/lib/mercado-pago-server'
import { assertProductionPaymentReady, cardPaymentReady, paymentFailureCode } from '@/lib/payment-processing-server'
import { reconcileAdminPayment, reconcileRecentAdminPayments } from './actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const metadata = { title: 'Pagamentos', robots: { index: false, follow: false } }

const messages: Record<string, string> = {
  atualizado: 'Consulta concluída. A lista mostra os registros salvos.',
  'nao-localizado': 'O Mercado Pago ainda não retornou um pagamento para esta tentativa. Isso não autoriza outra cobrança.',
  conferencia: 'A resposta foi salva, mas a tentativa ainda precisa de conferência. Não gere outra cobrança.',
  falha: 'Não foi possível concluir a consulta. Confira os logs de pagamentos na Vercel.',
}
const states: Record<string, string> = {
  created: 'Preparação', submitting: 'Solicitando', pending: 'Aguardando pagamento',
  approved: 'Aprovado', rejected: 'Recusado', cancelled: 'Cancelado',
  refunded: 'Estornado', uncertain: 'Em conferência', charged_back: 'Contestação',
}

export default async function PaymentsPage({ searchParams = {} }: { searchParams?: { aviso?: string;consultados?:string;conferir?:string;falhas?:string } }) {
  const { db } = await adminDatabase()
  let configuration = 'Não configurado'
  let database = 'Não verificado'
  let acceptsPayments = false
  let paymentConfigurationError = ''
  const cardsReady = await cardPaymentReady(db)
  try {
    const config = mercadoPagoConfig()
    configuration = config.environment === 'production' ? 'Produção' : 'Teste'
    await assertProductionPaymentReady(db)
    database = config.environment === 'production' ? 'Atualização V3 instalada' : 'Modo de teste'
    try {
      mercadoPagoPublicConfig()
      acceptsPayments = true
    } catch (error) {
      const code = paymentFailureCode(error)
      paymentConfigurationError = code === 'MP_PRODUCTION_DISABLED'
        ? 'Liberação de novos pagamentos desativada na Vercel.'
        : code
    }
  } catch (error) {
    database = paymentFailureCode(error)
  }

  const result = await db.from('serenity_checkout_payments_v2')
    .select('id,checkout_id,environment,method,amount_cents,state,application_state,last_error_code,provider_payment_id,created_at')
    .order('created_at', { ascending: false }).limit(100)

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <h1 className="text-3xl font-medium">Pagamentos</h1>
      <p className="mt-3 text-sm text-[#756B5D]">Consulte tentativas de pagamento, inclusive quando ainda não existe pedido.</p>
      <section className="mt-6 rounded-2xl border border-[#E5DED3] bg-white p-5 text-sm leading-7">
        <p>Cartão: {cardsReady ? 'Instalado' : 'Atualização do banco pendente'}</p>
        <p>Ambiente: <strong>{configuration}</strong></p>
        <p>Configuração: {database}</p>
        <p>Novos pagamentos: {acceptsPayments ? 'Habilitados na configuração' : 'Bloqueados'}</p>
        {paymentConfigurationError && <p>{paymentConfigurationError}</p>}
        <p className="mt-2 text-xs text-[#756B5D]">Esta tela não compra nem gera Pix. Consultar situação lê o Mercado Pago e aplica uma aprovação verificada. A autorização da conta precisa ser validada na primeira compra acompanhada.</p>
      </section>
      <form action={reconcileRecentAdminPayments} className="mt-5"><button className="min-h-[44px] rounded-full bg-[#292621] px-6 py-3 text-sm text-white">Atualizar pagamentos recentes</button><p className="mt-2 text-xs leading-6 text-[#756B5D]">Consulta até 20 tentativas pendentes dos últimos 3 dias e registra as aprovações verificadas no Mercado Pago. Não gera cobranças.</p></form>
      {searchParams.aviso==='lote' && <p role="status" className="mt-5 rounded-xl bg-[#F2EDE5] p-4 text-sm">Consulta concluída: {Number(searchParams.consultados) || 0} verificados · {Number(searchParams.conferir) || 0} precisam de conferência · {Number(searchParams.falhas) || 0} falhas. Confira a situação de cada pagamento abaixo. Se ainda houver pendentes, execute novamente.</p>}
      {searchParams.aviso && messages[searchParams.aviso] && <p role="status" className="mt-5 rounded-xl bg-[#F2EDE5] p-4 text-sm">{messages[searchParams.aviso]}</p>}
      {result.error ? <p role="alert" className="mt-6 text-sm text-red-700">Não foi possível carregar as tentativas. Confira a instalação das funções e permissões do banco.</p> : (
        <div className="mt-6 space-y-4">
          {(result.data || []).map(row => (
            <article key={row.id} className="rounded-2xl border border-[#E5DED3] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{saleMoney(Number(row.amount_cents) / 100)} · {row.method === 'card' ? 'Cartão' : 'Pix'} · {states[row.state] || 'Conferir'}</p>
                  <p className="mt-2 text-xs text-[#756B5D]">{saleDate(row.created_at)} · {row.environment === 'production' ? 'Produção' : 'Teste'}</p>
                  <p className="mt-2 break-all text-xs">Tentativa: {row.id}</p>
                  {row.provider_payment_id && <p className="mt-1 text-xs">Mercado Pago: {row.provider_payment_id}</p>}
                  {row.application_state === 'review' && <p className="mt-2 text-sm text-amber-800">Precisa de conferência · {row.last_error_code || 'Resposta pendente'}</p>}
                  {row.application_state === 'test_approved' && <p className="mt-2 text-sm">Teste aprovado; nenhum pedido real criado.</p>}
                  {row.state === 'approved' && row.application_state === 'applied' && row.environment === 'production' && <Link href={`/admin/pedidos/${row.checkout_id}`} className="mt-3 inline-block text-sm underline">Abrir pedido</Link>}
                </div>
                <form action={reconcileAdminPayment}>
                  <input type="hidden" name="attempt" value={row.id} />
                  <button className="min-h-[44px] rounded-full border border-[#DCD4C8] px-5 text-sm">Consultar situação</button>
                </form>
              </div>
            </article>
          ))}
          {!result.data?.length && <p className="rounded-2xl bg-white p-6 text-sm">Nenhuma tentativa de pagamento registrada.</p>}
        </div>
      )}
    </main>
  )
}
