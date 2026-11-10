'use server'

import { getCommercePolicy } from '@/lib/commerce-server'
import { isTopProduct,existingVariantStem } from '@/lib/commerce'

import {
  revalidatePath,
  revalidateTag,
} from 'next/cache'

import { adminDatabase } from '@/lib/admin-auth'

import {
  saleAmount,
  saleUuid,
} from '@/lib/admin-sales'

import type { SaleOption } from '@/lib/admin-sales'
import { canAnodize } from '@/lib/anodization'

export async function searchOrderProducts(
  search: string
): Promise<{
  error: string
  options: SaleOption[]
}> {
  const { db } = await adminDatabase()

  const safe = String(search)
    .replace(/[^a-zA-Z0-9À-ÿ -]/g, ' ')
    .trim()
    .slice(0, 100)

  if (safe.length < 2) {
    return {
      error: 'Digite ao menos duas letras ou números.',
      options: [],
    }
  }

  const result = await db
    .from('serenity_admin_promotion_products')
    .select(
      'id,name,sku,product_type,tags,regular_price,sale_price,sale_starts_at,sale_ends_at'
    )
    .or(
      `name.ilike.%${safe}%,sku.ilike.%${safe}%`
    )
    .order('name')
    .limit(12)

  if (result.error) {
    return {
      error: 'Não foi possível buscar os produtos.',
      options: [],
    }
  }

  const products = result.data || []

  const ids = products
    .filter(product =>
      product.product_type === 'variable'
    )
    .map(product => product.id)

  const variants = ids.length
    ? await db
        .from('serenity_admin_promotion_variants')
        .select(
          'id,product_id,name,sku,regular_price,sale_price,sale_starts_at,sale_ends_at'
        )
        .in('product_id', ids)
        .eq('enabled', true)
        .order('position')
        .limit(200)
    : {
        data: [],
        error: null,
      }

  if (variants.error) {
    return {
      error: 'Não foi possível buscar as variações.',
      options: [],
    }
  }

  const commerce=await getCommercePolicy()
  const metadata=commerce.included_stems && products.length ? await db.from('products').select('id,name,categories').in('id',products.map(product=>product.id)) : {data:[],error:null}
  if(metadata.error) return {error:'Não foi possível conferir as opções de haste.',options:[]}
  const variantMetadata=commerce.included_stems && variants.data?.length ? await db.from('product_variants').select('id,attributes').in('id',variants.data.map(variant=>variant.id)) : {data:[],error:null}
  if(variantMetadata.error)return {error:'Não foi possível conferir as medidas das variações.',options:[]}
  const stemsByVariant=new Map((variantMetadata.data || []).map(variant=>[variant.id,existingVariantStem(variant.attributes)]))
  const topIds=new Set((metadata.data || []).filter(product=>isTopProduct({name:product.name,categorySlugs:(product.categories || []).map((category:string)=>category.toLowerCase().trim())})).map(product=>product.id))
  const options: SaleOption[] = []

  for (const product of products) {
    const rows = product.product_type === 'variable'
      ? (variants.data || []).filter(
          variant =>
            variant.product_id === product.id
        )
      : [product]

    for (const row of rows) {
      const now = Date.now()

      const onSale =
        row.sale_price !== null &&
        (
          !row.sale_starts_at ||
          Date.parse(row.sale_starts_at) <= now
        ) &&
        (
          !row.sale_ends_at ||
          Date.parse(row.sale_ends_at) >= now
        )

      const value = onSale
        ? row.sale_price
        : row.regular_price

      options.push({
        product_id: product.id,

        variant_id:
          product.product_type === 'variable'
            ? row.id
            : '',

        name:
          product.product_type === 'variable'
            ? (
                `${product.name} — ${row.name}` +
                (row.sku ? ` · ${row.sku}` : '')
              )
            : product.name,

        price: value === null
          ? null
          : Number(value),

        includes_stem: topIds.has(product.id),
        stem_length: topIds.has(product.id) ? stemsByVariant.get(row.id) : undefined,
        anodizable: canAnodize(
          product.tags || []
        ),
      })
    }
  }

  return {
    error: options.length
      ? ''
      : 'Nenhum produto encontrado. Refine a busca pelo código da peça.',
    options,
  }
}

export async function saveManualOrder(
  input: {
    id: string
    customer: string
    status: string
    discount: string
    shipping: string
    expenses: string
    notes: string
    expected_fee?: number
    items: {
      product_id: string
      variant_id: string
      quantity: string
      unit_price: string
      color: string
      stem?: string
    }[]
  }
): Promise<{
  error: string
  id?: string
}> {
  const { db, user } = await adminDatabase()

  try {
    if (
      !input ||
      !saleUuid(input.id) ||
      !saleUuid(input.customer) ||
      !['pending', 'paid'].includes(input.status) ||
      typeof input.notes !== 'string' ||
      input.notes.length > 2000 ||
      !Array.isArray(input.items) ||
      input.items.length < 1 ||
      input.items.length > 50
    ) {
      throw new Error(
        'Confira o cliente e os itens do pedido.'
      )
    }

    const commerce=await getCommercePolicy()
    if(input.items.some(item=>item.color) && input.expected_fee !== commerce.anodization_fee) throw new Error('A regra de anodização mudou. Atualize a página antes de salvar.')
    const items = input.items.map(item => {
      if (
        !saleUuid(item.product_id) ||
        (
          item.variant_id !== '' &&
          !saleUuid(item.variant_id)
        ) ||
        !/^[1-9]\d{0,3}$/.test(item.quantity) ||
        typeof item.color !== 'string' ||
        item.color.length > 4 || (item.stem!==undefined && !['','4','6','8','10'].includes(item.stem))
      ) {
        throw new Error(
          'Confira as quantidades e as variações.'
        )
      }

      return {
        ...item,
        unit_price: saleAmount(item.unit_price),
      }
    })

    const { data, error } = await db.rpc(
      'serenity_admin_create_order',
      {
        p_id: input.id,
        p_admin: user.id,
        p_customer: input.customer,
        p_payload: {
          status: input.status,
          discount: saleAmount(input.discount),
          shipping: saleAmount(input.shipping),
          expenses: saleAmount(input.expenses),
          notes: input.notes,
          items,
        },
      }
    )

    if (error) {
      if(/TOP_STEM_REQUIRED|INVALID_STEM/.test(error.message)) return {error:'Escolha a haste de 4, 6, 8 ou 10 mm para cada labret.'}
      return {
        error:
          /STOCK_RESERVED|STOCK_UNAVAILABLE/.test(
            error.message
          )
            ? 'Saldo insuficiente ou reservado por outro pedido. Confira o estoque das peças.'
            : 'Não foi possível salvar. Confira os valores, a variação e a elegibilidade para anodização. O desconto não pode ultrapassar os produtos.',
      }
    }

    revalidatePath('/admin/produtos')
    revalidatePath('/admin/produtos/[id]', 'page')
    revalidateTag('catalog')
    revalidatePath('/admin/pedidos')
    revalidatePath('/admin/clientes')

    return {
      error: '',
      id: String(data),
    }
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : 'Confira os dados do pedido.',
    }
  }
}

export async function changeOrderStatus(
  id: string,
  expected: string,
  status: string
): Promise<{ error: string }> {
  const { db } = await adminDatabase()

  const allowed =
    (
      expected === 'pending' &&
      ['paid', 'cancelled'].includes(status)
    ) ||
    (
      expected === 'paid' &&
      status === 'refunded'
    )

  if (!saleUuid(id) || !allowed) {
    return {
      error: 'Mudança de situação inválida.',
    }
  }

  const { error } = await db.rpc(
    'serenity_admin_order_status',
    {
      p_id: id,
      p_expected: expected,
      p_status: status,
    }
  )

  if (error) {
    return {
      error:
        /STOCK_RESERVED|STOCK_UNAVAILABLE/.test(
          error.message
        )
          ? 'Saldo insuficiente ou reservado por outro pedido. Confira o estoque antes de confirmar o pagamento.'
          : 'O pedido pode ter sido alterado em outra tela. Atualize a página e tente novamente.',
    }
  }

  revalidatePath('/admin/produtos')
  revalidatePath('/admin/produtos/[id]', 'page')
  revalidateTag('catalog')
  revalidatePath('/admin/pedidos')
  revalidatePath(`/admin/pedidos/${id}`)

  return { error: '' }
}

export async function saveCustomer(
  input: {
    id: string
    name: string
    email: string
    phone: string
    notes: string
  }
): Promise<{ error: string }> {
  const { db } = await adminDatabase()

  if (
    !input ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.length > 180 ||
    typeof input.email !== 'string' ||
    input.email.length > 254 ||
    (
      input.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        input.email
      )
    ) ||
    typeof input.phone !== 'string' ||
    (
      input.phone &&
      !/^\d{10,15}$/.test(input.phone)
    ) ||
    typeof input.notes !== 'string' ||
    input.notes.length > 2000 ||
    !saleUuid(input.id)
  ) {
    return {
      error: 'Confira nome, e-mail e telefone com DDD.',
    }
  }

  const { error } = await db
    .from('serenity_customers')
    .upsert(
      {
        id: input.id,
        name: input.name.trim(),
        email: input.email.trim(),
        phone: input.phone,
        notes: input.notes,
      },
      {
        onConflict: 'id',
      }
    )

  if (error) {
    return {
      error: 'Não foi possível salvar o cliente.',
    }
  }

  revalidatePath('/admin/clientes')

  return { error: '' }
}
