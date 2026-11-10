'use server'

import {readCampaignPages} from '@/lib/campaign-pagination'
import { revalidatePath, revalidateTag } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { readMaterialCampaignTargets, readCategoryCampaignTargets } from '@/lib/campaign-material'
import { localToIso, localInput } from '@/lib/promotion-ui'

import type {
  Campaign,
  CampaignItem,
  CampaignTarget,
  CampaignProduct,
} from '@/lib/promotion-ui'

export type {
  Campaign,
  CampaignItem,
  CampaignTarget,
  CampaignProduct,
} from '@/lib/promotion-ui'

interface SaveInput {
  id: string
  version: number
  name: string
  startsNow: boolean
  startsLocal: string
  endsLocal: string
  items: {
    productId: string
    variantId: string | null
    discountType: 'percent' | 'fixed'
    discountValue: string
  }[]
}

const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)

function money(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value)) ||
    Number(value) < 0
  ) {
    return null
  }

  return Number(value)
}

function errorMessage(error: unknown): string {
  const text =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : ''

  const messages: Record<string, string> = {
    CAMPAIGN_STALE:
      'A campanha mudou. Atualize a página e confira os dados.',

    CAMPAIGN_NOT_DRAFT:
      'Somente rascunhos podem ser editados ou publicados.',

    CAMPAIGN_INVALID_PERIOD:
      'O término deve estar no futuro e ser posterior ao início.',

    CAMPAIGN_INVALID_NAME:
      'Informe um nome de até 120 caracteres.',

    CAMPAIGN_INVALID_REGULAR_PRICE:
      'Cadastre um preço normal maior que zero para todos os participantes.',

    CAMPAIGN_INVALID_DISCOUNT_VALUE:
      'Informe um desconto positivo com até duas casas decimais.',

    CAMPAIGN_INVALID_PERCENT:
      'O percentual deve ser maior que zero e no máximo 100.',

    CAMPAIGN_INVALID_FINAL_PRICE:
      'O preço final deve ser menor que o normal e não pode ser negativo.',

    CAMPAIGN_PRODUCT_UNAVAILABLE:
      'O produto precisa estar publicado e visível.',

    CAMPAIGN_VARIANT_UNAVAILABLE:
      'Uma variação foi desativada. Revise os participantes.',

    CAMPAIGN_VARIANT_MISMATCH:
      'Uma variação não pertence ao produto informado.',

    CAMPAIGN_SELECT_VARIANTS:
      'Selecione as variações do produto.',

    CAMPAIGN_ALREADY_ENDED:
      'A campanha encerrou e permanece como histórico.',

    CAMPAIGN_REGULAR_PRICE_LOCKED:
      'O preço normal está protegido por uma campanha. Descontos de outras campanhas continuam permitidos.',

    CAMPAIGN_NOT_FOUND:
      'Campanha não encontrada.',

    CAMPAIGN_EMPTY:
      'Adicione participantes.',

    CAMPAIGN_INVALID_ITEMS:
      'Selecione pelo menos um participante válido.',
  }

  for (const [key, value] of Object.entries(messages)) {
    if (text.includes(key)) {
      return value
    }
  }

  return 'Não foi possível concluir. Atualize a página e confira o resultado antes de repetir.'
}

function refresh() {
  revalidatePath('/admin/campanhas')
  revalidatePath('/admin/produtos')
  revalidatePath('/admin/produtos/[id]', 'page')
  revalidateTag('catalog')
  revalidatePath('/', 'layout')
}

export async function searchCampaignProducts(
  input: string
): Promise<{
  error: string
  products: CampaignProduct[]
}> {
  const { db } = await adminDatabase()

  const search = String(input)
    .replace(/[^a-zA-Z0-9À-ÿ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)

  if (search.length < 2) {
    return {
      error: 'Digite ao menos dois caracteres.',
      products: [],
    }
  }

  const result = await db
    .from('products')
    .select('id,name,sku,product_type')
    .eq('status', 'published')
    .neq('visibility', 'hidden')
    .or(
      `name.ilike.%${search}%,sku.ilike.%${search}%`
    )
    .order('name')
    .order('id')
    .limit(10)

  if (result.error) {
    return {
      error: 'Não foi possível buscar produtos.',
      products: [],
    }
  }

  return {
    error: '',
    products: (result.data || []).map(product => ({
      id: String(product.id),
      name: String(product.name),
      sku: String(product.sku || ''),
      productType: String(product.product_type),
    })),
  }
}

export async function campaignProductTargets(
  id: string
): Promise<{
  error: string
  targets: CampaignTarget[]
}> {
  const { db } = await adminDatabase()

  if (!validId(id)) {
    return {
      error: 'Produto inválido.',
      targets: [],
    }
  }

  const result = await db
    .from('products')
    .select(
      'id,name,sku,product_type,regular_price,status,visibility'
    )
    .eq('id', id)
    .single()

  const product = result.data

  if (
    result.error ||
    !product ||
    product.status !== 'published' ||
    product.visibility === 'hidden'
  ) {
    return {
      error: 'Produto indisponível.',
      targets: [],
    }
  }

  if (product.product_type === 'simple') {
    return {
      error: '',
      targets: [
        {
          productId: id,
          variantId: null,
          productName: String(product.name),
          productSku: String(product.sku || ''),
          variantName: '',
          regularPrice: money(product.regular_price),
        },
      ],
    }
  }

  if (product.product_type !== 'variable') {
    return {
      error: 'Tipo de produto não suportado.',
      targets: [],
    }
  }

  const variants = await readCampaignPages((from,to)=>db
    .from('product_variants')
    .select('id,name,sku,regular_price')
    .eq('product_id', id)
    .eq('enabled', true)
    .order('position')
    .order('id')
    .range(from,to))

  if (variants.error || !variants.data?.length) {
    return {
      error: 'Não foi possível carregar variações ativas.',
      targets: [],
    }
  }


  return {
    error: '',
    targets: variants.data.map(variant => ({
      productId: id,
      variantId: String(variant.id),
      productName: String(product.name),
      productSku: String(product.sku || ''),
      variantSku: String(variant.sku || ''),
      variantName: [
        variant.name,
        variant.sku,
      ].filter(Boolean).join(' · '),
      regularPrice: money(variant.regular_price),
    })),
  }
}

export async function loadCampaign(
  id: string
): Promise<{
  error: string
  campaign?: Campaign
}> {
  const { db } = await adminDatabase()

  if (!validId(id)) {
    return {
      error: 'Campanha inválida.',
    }
  }

  const [campaignResult, itemsResult] = await Promise.all([
    db
      .from('serenity_promotion_campaigns')
      .select(
        'id,name,status,starts_at,ends_at,version'
      )
      .eq('id', id)
      .single(),

    readCampaignPages((from,to)=>db
      .from('serenity_promotion_items')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at')
      .order('id')
      .range(from,to)),
  ])

  if (
    campaignResult.error ||
    itemsResult.error ||
    !campaignResult.data
  ) {
    return {
      error: 'Não foi possível carregar a campanha.',
    }
  }

  const records = itemsResult.data || []

  const productIds = Array.from(
    new Set<string>(
      records.map(item => String(item.product_id))
    )
  )

  const variantIds = records
    .filter(item => item.variant_id)
    .map(item => String(item.variant_id))

  const products =
    new Map<string, Record<string, unknown>>()

  const variants =
    new Map<string, Record<string, unknown>>()

  for(const [table,ids,destination] of [
    ['products',productIds,products],['product_variants',variantIds,variants],
  ] as const){
    for(let offset=0;offset<ids.length;offset+=100){
      const result=await readCampaignPages((from,to)=>db.from(table).select('id,name,sku,regular_price').in('id',ids.slice(offset,offset+100)).order('id').range(from,to))
      if(result.error)return {error:'Falha ao carregar os participantes.'}
      for(const row of result.data)destination.set(String(row.id),row)
    }
  }

  const campaign = campaignResult.data

  return {
    error: '',
    campaign: {
      id: String(campaign.id),
      name: String(campaign.name),
      status: campaign.status as Campaign['status'],
      startsAt: String(campaign.starts_at),
      endsAt: String(campaign.ends_at),
      version: Number(campaign.version),

      items: records.map(item => {
        const product = products.get(
          String(item.product_id)
        )

        const variant = item.variant_id
          ? variants.get(String(item.variant_id))
          : undefined

        return {
          productId: String(item.product_id),
          variantId: item.variant_id
            ? String(item.variant_id)
            : null,

          productName: String(
            product?.name || 'Produto indisponível'
          ),

          productSku: String(product?.sku || ''),
          variantSku: String(variant?.sku || ''),
          variantName: String(variant?.name || ''),

          regularPrice: campaign.status === 'draft'
            ? money(
                item.variant_id
                  ? variant?.regular_price
                  : product?.regular_price
              )
            : money(item.original_regular_price),

          discountType:
            item.discount_type as CampaignItem['discountType'],

          discountValue: String(item.discount_value),

          appliedSalePrice: money(
            item.applied_sale_price
          ),
        }
      }),
    },
  }
}

export async function saveCampaign(
  input: SaveInput
): Promise<{
  error: string
  id?: string
}> {
  const { db, user } = await adminDatabase()

  try {
    if (
      !input ||
      !validId(input.id) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 0 ||
      typeof input.name !== 'string' ||
      typeof input.startsNow !== 'boolean' ||
      !Array.isArray(input.items) ||
      input.items.length < 1
    ) {
      return {
        error: 'Confira os dados e selecione pelo menos um participante.',
      }
    }

    const seen = new Set<string>()

    const items = input.items.map(item => {
      if (
        !validId(item.productId) ||
        (
          item.variantId !== null &&
          !validId(item.variantId)
        ) ||
        !['percent', 'fixed'].includes(
          item.discountType
        ) ||
        typeof item.discountValue !== 'string' ||
        item.discountValue.length > 30 ||
        !/^\d+(?:[.,]\d{1,2})?$/.test(
          item.discountValue.trim()
        )
      ) {
        throw new Error(
          'Confira os participantes e descontos.'
        )
      }

      const key =
        `${item.productId}:${item.variantId || 'simple'}`

      if (seen.has(key)) {
        throw new Error('Participante repetido.')
      }

      seen.add(key)

      return {
        product_id: item.productId,
        variant_id: item.variantId,
        discount_type: item.discountType,
        discount_value: item.discountValue
          .trim()
          .replace(',', '.'),
      }
    })

    const starts = input.startsNow
      ? new Date().toISOString()
      : localToIso(input.startsLocal)

    const ends = localToIso(input.endsLocal)

    if (
      Date.parse(ends) <= Date.parse(starts) ||
      Date.parse(ends) <= Date.now()
    ) {
      return {
        error: 'O término deve estar no futuro e ser posterior ao início.',
      }
    }

    const result = await db.rpc(
      'serenity_promotion_save_draft',
      {
        p_id: input.id,
        p_version: input.version,
        p_actor: user.id,
        p_name: input.name.trim(),
        p_starts: starts,
        p_ends: ends,
        p_items: items,
      }
    )

    if (result.error) {
      return {
        error: errorMessage(result.error),
      }
    }

    revalidatePath('/admin/campanhas')

    return {
      error: '',
      id: input.id,
    }
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : ''

    const knownMessages = [
      'Confira as datas e horários.',
      'Confira os participantes e descontos.',
      'Participante repetido.',
    ]

    return {
      error: knownMessages.includes(message)
        ? message
        : errorMessage(error),
    }
  }
}

export async function changeCampaign(
  id: string,
  version: number,
  command: 'publish' | 'cancel'
): Promise<{
  error: string
}> {
  const { db } = await adminDatabase()

  if (
    !validId(id) ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !['publish', 'cancel'].includes(command)
  ) {
    return {
      error: 'Operação inválida.',
    }
  }

  const result = await db.rpc(
    command === 'publish'
      ? 'serenity_promotion_publish'
      : 'serenity_promotion_cancel',
    {
      p_id: id,
      p_version: version,
    }
  )

  if (result.error) {
    return {
      error: errorMessage(result.error),
    }
  }

  refresh()

  return {
    error: '',
  }
}

export async function campaignMaterialTargets(material:string):Promise<{error:string;targets:CampaignTarget[]}>{
 const {db}=await adminDatabase()
 if(typeof material!=='string' || !material.trim() || material.length>180)return {error:'Selecione um material válido.',targets:[]}
 return readMaterialCampaignTargets(db,material.trim())
}

export async function campaignCategoryTargets(category:string):Promise<{error:string;targets:CampaignTarget[]}>{
 const {db}=await adminDatabase()
 if(typeof category!=='string' || !category.trim() || category.length>180)return {error:'Selecione uma categoria válida.',targets:[]}
 return readCategoryCampaignTargets(db,category.trim())
}

// Published campaigns are immutable. Prepare a draft with the original terms plus missing targets.
export async function prepareMaterialCampaign(sourceId:string,material:string,id:string) {
 return prepareSelectionCampaign(sourceId,material,id,'material')
}
export async function prepareCategoryCampaign(sourceId:string,category:string,id:string) {
 return prepareSelectionCampaign(sourceId,category,id,'category')
}
async function prepareSelectionCampaign(sourceId:string,material:string,id:string,kind:'material'|'category'):Promise<{error:string;id?:string;added?:number}>{
 await adminDatabase()
 if(!validId(sourceId) || !validId(id) || sourceId===id || typeof material!=='string' || !material.trim() || material.length>180)return {error:'Confira a campanha e a seleção.'}
 const loaded=await loadCampaign(sourceId)
 const source=loaded.campaign
 if(loaded.error || !source)return {error:loaded.error || 'Campanha não encontrada.'}
 if(source.status!=='published' || Date.parse(source.endsAt)<=Date.now())return {error:'Selecione uma campanha publicada que ainda não terminou.'}
 const first=source.items[0]
 if(!first || source.items.some(item=>item.discountType!==first.discountType || Number(item.discountValue)!==Number(first.discountValue)))return {error:'Esta campanha tem descontos diferentes. Crie um rascunho e confira o desconto de cada participante.'}
 const result=await (kind==='material'?campaignMaterialTargets(material):campaignCategoryTargets(material))
 if(result.error)return {error:result.error}
 const existing=new Set(source.items.map(item=>`${item.productId}:${item.variantId || 'simple'}`))
 const additions=result.targets.filter(item=>!existing.has(`${item.productId}:${item.variantId || 'simple'}`))
 if(!additions.length)return {error:'Todas as peças elegíveis desta seleção já estão na campanha.'}
 const saved=await saveCampaign({
  id,version:0,name:(source.name+' · atualizada').slice(0,120),startsNow:Date.parse(source.startsAt)<=Date.now(),startsLocal:localInput(source.startsAt),endsLocal:localInput(source.endsAt),
  items:[...source.items,...additions].map(item=>({productId:item.productId,variantId:item.variantId,discountType:first.discountType,discountValue:first.discountValue})),
 })
 return saved.error?{error:saved.error}:{error:'',id,added:additions.length}
}
