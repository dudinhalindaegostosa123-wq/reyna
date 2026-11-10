import { NextRequest, NextResponse } from 'next/server'
import { getProjectSuggestionPage } from '@/lib/catalog-server'
import { REGIONS, COLORS, TYPES, DETAILS } from '@/lib/ear-project'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const region = params.get('region') || ''
  const color = params.get('color') || 'livre'
  const type = params.get('type') || 'livre'
  const detail = params.get('detail') || 'livre'
  const requestedPage = Number(params.get('page') || '1')

  if (
    !Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 100000 ||
    !REGIONS.some((item) => item.id === region) ||
    !Object.prototype.hasOwnProperty.call(COLORS, color) ||
    !Object.prototype.hasOwnProperty.call(TYPES, type) ||
    !Object.prototype.hasOwnProperty.call(DETAILS, detail)
  ) {
    return NextResponse.json({ error: 'Seleção inválida.' }, { status: 400 })
  }

  const query = new URLSearchParams({
    select: 'id,slug,name,price,product_type,storage_path,thumbnail_path',
    visibility: 'in.(visible,catalog)',
    product_type: 'in.(simple,variable)',
    in_stock: 'eq.true',
    price_available: 'eq.true',
    storage_path: 'not.is.null',
    order: 'featured.desc,created_at.desc,database_id.asc',
    limit: '12',
  })

  const aliases = region === 'transversal'
    ? ['transversal', 'industrial']
    : region === 'lobulo' ? ['lobulo', 'lobulos'] : [region]

  const filters = [
    `or(${aliases.map((alias) => `category_slugs.cs.{${alias}}`).join(',')})`,
  ]

  function names(words: string[]) {
    return `or(${words.map((word) => `name.ilike.*${word}*`).join(',')})`
  }

  if (color === 'dourado') {
    filters.push('or(name.ilike.*ouro*,name.ilike.*gold*,name.ilike.*dourad*)')
  } else if (color === 'prateado') {
    filters.push('or(name.ilike.*pratead*,name.ilike.*prata*,name.ilike.*titânio*,name.ilike.*titanio*)')
    ;['ouro', 'gold', 'dourad', 'black', 'pret', 'anodiz', 'revestid'].forEach((word) => {
      filters.push(`name.not.ilike.*${word}*`)
    })
  }

  if (type === 'argola') filters.push(names(['argola', 'clicker']))
  if (type === 'topo') filters.push(names(['topo', 'labret', 'stud']))
  if (type === 'pingente') filters.push(names(['pingente', 'pendente', 'corrente']))
  if (type === 'ponto-de-luz') filters.push(names(['ponto de luz', 'solitário', 'solitario', 'cristal redondo', 'esfera cravejada']))
  if (detail === 'cristais') filters.push(names(['cravejad', 'cristal', 'cristais', 'zircônia', 'zirconia', 'swarovski']))
  if (detail === 'pedras-naturais') filters.push(names(['natural', 'naturais', 'abalone', 'turquesa', 'ametista']))
  if (detail === 'swarovski') filters.push(names(['swarovski']))

  query.set('and', `(${filters.join(',')})`)

  try {
    const result = await getProjectSuggestionPage(query, requestedPage)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Sugestões do projeto auricular:', error instanceof Error ? error.message : 'Falha')
    return NextResponse.json({ error: 'Não foi possível carregar as joias. Tente novamente.' }, { status: 502 })
  }
}
