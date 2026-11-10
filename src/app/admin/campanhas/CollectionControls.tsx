import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { COLLECTION_TIER_SUMMARY } from '@/lib/collection-progress'
import { adminDatabase } from '@/lib/admin-auth'

async function saveCollection(form: FormData) {
  'use server'
  const { db } = await adminDatabase()
  const { error } = await db.from('serenity_collection_settings').update({ enabled: form.get('enabled') === 'on' }).eq('singleton', true)
  if (error) throw new Error('COLLECTION_SETTINGS_SAVE')
  revalidatePath('/')
  revalidatePath('/admin/campanhas')
  redirect('/admin/campanhas')
}

export default async function CollectionControls() {
  const { db } = await adminDatabase()
  const { data, error } = await db.from('serenity_collection_settings').select('enabled').eq('singleton', true).maybeSingle()
  if (error && !['42P01', 'PGRST205'].includes(error.code)) throw new Error('COLLECTION_SETTINGS_READ')
  return <section className="mt-6 rounded-3xl border border-[#E5DED3] bg-white p-5">
    <h2 className="text-lg">Lunarity Collection · Progressivo</h2>
    <p className="mt-2 text-sm leading-6 text-[#756B5D]">{COLLECTION_TIER_SUMMARY}. Somente joias elegíveis; ouro 18K e Bioflex não contam para as faixas nem recebem o desconto progressivo. Acumulável com cupons, sem aplicar as condições de atacado. Calculado após o cupom, sem frete e taxa de anodização.</p>
    {error || !data ? <p className="mt-3 text-xs text-amber-800">Aguardando a instalação do SQL de desconto progressivo no Supabase.</p> : <form action={saveCollection} className="mt-3 flex flex-wrap items-center gap-4">
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={data.enabled} />Campanha ativa</label>
      <button className="min-h-[44px] rounded-full border border-[#DCD4C8] px-5 text-xs">Salvar ativação</button>
    </form>}
    <p className="mt-2 text-xs text-[#81796C]">A alteração vale para novas cotações. Pagamentos já iniciados mantêm os valores reservados.</p>
  </section>
}
