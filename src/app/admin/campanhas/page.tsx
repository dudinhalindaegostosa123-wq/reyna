import Link from 'next/link'
import {readAdminPriceOptions} from '@/lib/admin-price-options'
import CollectionControls from './CollectionControls'
import { redirect } from 'next/navigation'
import { adminDatabase } from '@/lib/admin-auth'
import { campaignPhase } from '@/lib/promotion-ui'
import { loadCampaign } from './actions'
import CampaignEditor from './CampaignEditor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const metadata = {
  title: 'Campanhas | Administração Serenity',
}

interface Props {
  searchParams?: Record<
    string,
    string | string[] | undefined
  >
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default async function Page({
  searchParams = {},
}: Props) {
  const { db } = await adminDatabase()

  const options=await readAdminPriceOptions(db)

  const requested = Number(searchParams.page)

  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, 100000)
      : 1

  const selected =
    typeof searchParams.edit === 'string'
      ? searchParams.edit
      : ''

  const result = await db
    .from('serenity_promotion_campaigns')
    .select(
      'id,name,status,starts_at,ends_at,version',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .order('id')
    .range(
      (page - 1) * 20,
      page * 20 - 1
    )

  if (result.error?.code === 'PGRST103') {
    redirect('/admin/campanhas')
  }

  if (result.error) {
    throw new Error('ADMIN_CAMPAIGNS_QUERY')
  }

  const pages = Math.max(
    1,
    Math.ceil((result.count || 0) / 20)
  )

  if (page > pages) {
    redirect('/admin/campanhas?page=' + pages)
  }

  const loaded = selected
    ? await loadCampaign(selected)
    : {
        error: '',
        campaign: undefined,
      }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <h1 className="text-3xl font-medium">
        Campanhas
      </h1>

      <p className="mt-3 text-sm text-[#81796C]">
        Campanhas de preço usam o menor preço vigente
        entre si. O progressivo e os cupons seguem
        suas regras próprias.
      </p>

      <p className="mt-2 text-xs leading-relaxed text-[#81796C]">
        Datas em Brasília. A vitrine usa cache e
        pode levar cerca de um minuto para atualizar
        após uma transição de horário; o checkout
        consulta o preço novamente.
      </p>

      <CollectionControls />

      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-3xl border border-[#E5DED3] bg-white">
          <div className="border-b p-5">
            <Link
              href="/admin/campanhas"
              className="inline-block rounded-full bg-[#292621] px-5 py-3 text-xs text-white"
            >
              + Nova campanha
            </Link>

            <p className="mt-3 text-xs">
              {result.count || 0} campanha(s)
            </p>
          </div>

          {(result.data || []).map(campaign => (
            <Link
              key={campaign.id}
              href={
                `/admin/campanhas?edit=${campaign.id}` +
                `&page=${page}`
              }
              className={
                'block border-b p-5 ' +
                (
                  selected === campaign.id
                    ? 'bg-[#F5EFE5]'
                    : ''
                )
              }
            >
              <p className="break-words text-sm font-medium">
                {campaign.name}
              </p>

              <p className="mt-2 text-xs">
                {campaignPhase({
                  status: campaign.status,
                  startsAt: campaign.starts_at,
                  endsAt: campaign.ends_at,
                })}
              </p>

              <p className="mt-2 text-[11px] leading-relaxed">
                Início:{' '}
                {formatDate(campaign.starts_at)}

                <br />

                Término:{' '}
                {formatDate(campaign.ends_at)}
              </p>
            </Link>
          ))}

          {!result.data?.length && (
            <p className="p-5 text-xs">
              Nenhuma campanha cadastrada.
            </p>
          )}

          <nav
            aria-label="Paginação de campanhas"
            className="flex justify-between gap-3 p-5 text-xs"
          >
            <span>
              {page} de {pages}
            </span>

            {page > 1 && (
              <Link
                href={
                  '/admin/campanhas?page=' +
                  (page - 1)
                }
              >
                ← Anterior
              </Link>
            )}

            {page < pages && (
              <Link
                href={
                  '/admin/campanhas?page=' +
                  (page + 1)
                }
              >
                Próxima →
              </Link>
            )}
          </nav>
        </aside>

        {loaded.error ? (
          <section
            role="alert"
            className="rounded-3xl border bg-white p-6"
          >
            {loaded.error}
          </section>
        ) : (
          <CampaignEditor
            key={
              loaded.campaign
                ? (
                    loaded.campaign.id +
                    ':' +
                    loaded.campaign.version
                  )
                : 'new'
            }
            initial={loaded.campaign}
            materials={options.materials}
            categories={options.categories}
            materialError={options.error || undefined}
          />
        )}
      </div>
    </main>
  )
}
