'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import {
  searchCampaignProducts,
  campaignProductTargets,
  campaignMaterialTargets,
  campaignCategoryTargets,
  prepareCategoryCampaign,
  prepareMaterialCampaign,
  saveCampaign,
  loadCampaign,
  changeCampaign,
} from './actions'

import {
  localInput,
  formatMoney,
  targetKey,
  preview,
  campaignPhase,
  matchesCampaignParticipant,
} from '@/lib/promotion-ui'

import type {
  Campaign,
  CampaignItem,
  CampaignTarget,
  CampaignProduct,
} from '@/lib/promotion-ui'

const field =
  'mt-2 block h-11 min-w-0 w-full max-w-full rounded-xl border border-[#DDD4C7] bg-white px-3 text-base outline-none focus:border-[#947B57] sm:text-sm disabled:bg-[#F4F1EC]'

const button =
  'min-h-[44px] rounded-full border border-[#CFC3B1] bg-white px-5 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-40'

function CampaignPager({page,total,onPage}:{page:number;total:number;onPage:(page:number)=>void}){
 const pages=Math.ceil(total/50)
 if(pages<=1)return null
 return <nav aria-label="Páginas de participantes" className="my-3 flex items-center gap-4 text-xs">
  <button type="button" disabled={page===0} onClick={()=>onPage(page-1)} className={button}>Anterior</button>
  <span>{page+1} de {pages} · {total} participantes</span>
  <button type="button" disabled={page>=pages-1} onClick={()=>onPage(page+1)} className={button}>Próxima</button>
 </nav>
}

export default function CampaignEditor({
  initial,
  materials=[],
  categories=[],
  materialError,
}: {
  categories?:{slug:string;name:string}[]
  materials?:string[]
  materialError?:string
  initial?: Campaign
}) {
  const router = useRouter()
  const [itemPage,setItemPage]=useState(0)
  const [participantSearch,setParticipantSearch]=useState('')
  const [replacementId,setReplacementId]=useState('')
  const [replacementScope,setReplacementScope]=useState('')
  const [targetPage,setTargetPage]=useState(0)
  const [material,setMaterial]=useState('')
  const [category,setCategory]=useState('')
  const [coverage,setCoverage]=useState<{total:number;missing:CampaignTarget[]}|null>(null)
  const [targetHeading,setTargetHeading]=useState('')

  const [saved, setSaved] = useState(initial)
  const [id, setId] = useState(initial?.id || '')
  const [name, setName] = useState(initial?.name || '')
  const [startsNow, setStartsNow] = useState(!initial)

  const [start, setStart] = useState(
    initial ? localInput(initial.startsAt) : ''
  )

  const [end, setEnd] = useState(
    initial ? localInput(initial.endsAt) : ''
  )

  const [items, setItems] = useState<CampaignItem[]>(
    initial?.items || []
  )

  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')

  const [products, setProducts] = useState<
    CampaignProduct[]
  >([])

  const [targets, setTargets] = useState<
    CampaignTarget[]
  >([])

  const [selected, setSelected] = useState<string[]>([])

  const [kind, setKind] = useState<'percent' | 'fixed'>(
    'percent'
  )

  const [discount, setDiscount] = useState('10')

  const filteredItems=items.map((item,index)=>({item,index})).filter(({item})=>matchesCampaignParticipant(item,participantSearch))
  const visibleItemPage=Math.min(itemPage,Math.max(0,Math.ceil(filteredItems.length/50)-1))
  const visibleTargetPage=Math.min(targetPage,Math.max(0,Math.ceil(targets.length/50)-1))

  const editable = !saved || saved.status === 'draft'

  const invalid = items.some(
    item => preview(item) === null
  )

  const ended = Boolean(
    saved &&
    saved.status === 'published' &&
    Date.parse(saved.endsAt) < Date.now()
  )

  function changed() {
    setDirty(true)
    setMessage('')
  }

  function apply(campaign: Campaign) {
    setSaved(campaign)
    setId(campaign.id)
    setName(campaign.name)
    setStart(localInput(campaign.startsAt))
    setEnd(localInput(campaign.endsAt))
    setStartsNow(false)
    setItems(campaign.items)
    setDirty(false)
    setTargets([])
    setTargetPage(0)
    setSelected([])
  }

  async function find() {
    if (busy) return

    setBusy(true)
    setMessage('')
    setTargets([])
    setTargetPage(0)
    setSelected([])

    try {
      const result = await searchCampaignProducts(search)

      setProducts(result.products)

      setMessage(
        result.error ||
        (
          result.products.length
            ? ''
            : 'Nenhum produto encontrado.'
        )
      )
    } catch {
      setMessage('Falha ao buscar produtos.')
    } finally {
      setBusy(false)
    }
  }

  async function prepareUpdatedCampaign(kind:'material'|'category'='material'){
    if(busy || !saved || !(kind==='material'?material:category))return
    const scope=kind+':'+(kind==='material'?material:category)
    const nextId=(replacementScope===scope && replacementId) || crypto.randomUUID()
    setReplacementScope(scope);setReplacementId(nextId);setBusy(true);setMessage('')
    try{
      const result=await (kind==='material'?prepareMaterialCampaign(saved.id,material,nextId):prepareCategoryCampaign(saved.id,category,nextId))
      if(result.error){setMessage(result.error);return}
      router.push('/admin/campanhas?edit='+result.id)
    }catch{setMessage('Não foi possível confirmar. Confira a lista de campanhas antes de repetir.')}
    finally{setBusy(false)}
  }

  async function chooseMaterial(){
    if(busy || !material)return
    setBusy(true);setMessage('');setTargets([]);setTargetPage(0);setSelected([]);setProducts([])
    try{
      const result=await campaignMaterialTargets(material)
      setTargets(result.targets);setSelected(result.targets.map(targetKey))
      setTargetHeading(`Material: ${material} · ${result.targets.length} participantes`)
      setMessage(result.error)
    }catch{setMessage('Falha ao carregar o material.')}
    finally{setBusy(false)}
  }

  async function chooseCategory(){
    if(busy || !category)return
    setBusy(true);setMessage('');setTargets([]);setTargetPage(0);setSelected([]);setProducts([])
    try{
      const result=await campaignCategoryTargets(category)
      setTargets(result.targets);setSelected(result.targets.map(targetKey))
      setTargetHeading(`Categoria: ${categories.find(item=>item.slug===category)?.name || category} · ${result.targets.length} participantes`)
      setMessage(result.error)
    }catch{setMessage('Falha ao carregar a categoria.')}
    finally{setBusy(false)}
  }

  async function auditCoverage(kind:'material'|'category'){
    if(busy || !saved)return
    setBusy(true);setMessage('');setCoverage(null)
    try{
      const result=await (kind==='material'?campaignMaterialTargets(material):campaignCategoryTargets(category))
      if(result.error){setMessage(result.error);return}
      const included=new Set(saved.items.map(targetKey))
      setCoverage({total:result.targets.length,missing:result.targets.filter(item=>!included.has(targetKey(item)))})
    }catch{setMessage('Não foi possível conferir os participantes.')}
    finally{setBusy(false)}
  }

  async function choose(productId: string) {
    if (busy) return

    setBusy(true)
    setTargets([])
    setTargetPage(0)
    setSelected([])
    setMessage('')

    try {
      const result =
        await campaignProductTargets(productId)

      setTargetHeading('')

      setTargets(result.targets)

      setSelected(
        result.targets
          .filter(target =>
            target.regularPrice !== null &&
            target.regularPrice > 0
          )
          .map(targetKey)
      )

      setMessage(result.error)
    } catch {
      setMessage('Falha ao carregar o produto.')
    } finally {
      setBusy(false)
    }
  }

  function add() {
    const existing = new Set(items.map(targetKey))
    const selectedKeys=new Set(selected)

    const additions: CampaignItem[] = targets
      .filter(target =>
        selectedKeys.has(targetKey(target)) &&
        !existing.has(targetKey(target))
      )
      .map(target => ({
        ...target,
        discountType: kind,
        discountValue: discount,
        appliedSalePrice: null,
      }))

    if (!additions.length) {
      setMessage(
        'Selecione participantes que ainda não foram adicionados.'
      )
      return
    }

    if (
      additions.some(item => preview(item) === null)
    ) {
      setMessage(
        'Confira os descontos dos participantes.'
      )
      return
    }

    setItems(previous => [
      ...previous,
      ...additions,
    ])

    setTargets([])
    setTargetPage(0)
    setSelected([])
    changed()
  }

  async function save() {
    if (busy) return

    if (!items.length || invalid) {
      setMessage('Confira os participantes e descontos.')
      return
    }

    const nextId = id || crypto.randomUUID()

    setId(nextId)
    setBusy(true)
    setMessage('')

    let confirmed = false

    try {
      const result = await saveCampaign({
        id: nextId,
        version: saved?.version || 0,
        name,
        startsNow,
        startsLocal: start,
        endsLocal: end,
        items: items.map(item => ({
          productId: item.productId,
          variantId: item.variantId,
          discountType: item.discountType,
          discountValue: item.discountValue,
        })),
      })

      if (result.error) {
        setMessage(result.error)
        return
      }

      confirmed = true

      const loaded = await loadCampaign(nextId)

      if (loaded.campaign) {
        apply(loaded.campaign)

        setMessage(
          'Rascunho salvo. Confira os dados antes de publicar.'
        )
      } else {
        setMessage(
          'Rascunho salvo; abra os dados salvos pelo link abaixo.'
        )
      }

      const currentId = new URLSearchParams(
        window.location.search
      ).get('edit')

      if (currentId === nextId) {
        router.refresh()
      } else {
        router.replace(
          '/admin/campanhas?edit=' + nextId
        )
      }
    } catch {
      setMessage(
        confirmed
          ? 'Rascunho salvo. Atualize a página para recarregar.'
          : 'Resultado não confirmado. Confira a lista antes de repetir.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function run(
    command: 'publish' | 'cancel'
  ) {
    if (busy || !saved) return

    if (command === 'publish' && dirty) {
      setMessage('Salve antes de publicar.')
      return
    }

    const confirmedByUser = window.confirm(
      command === 'publish'
        ? 'Publicar? A loja usará o menor preço entre as promoções e campanhas vigentes, sem somar descontos.'
        : 'Cancelar? Outras campanhas continuam valendo.'
    )

    if (!confirmedByUser) return

    setBusy(true)
    setMessage('')

    let confirmed = false

    try {
      const result = await changeCampaign(
        saved.id,
        saved.version,
        command
      )

      if (result.error) {
        setMessage(result.error)
        return
      }

      confirmed = true

      const loaded = await loadCampaign(saved.id)

      if (loaded.campaign) {
        apply(loaded.campaign)
      }

      setMessage(
        command === 'publish'
          ? 'Campanha publicada.'
          : 'Campanha cancelada. As demais promoções permanecem.'
      )

      router.refresh()
    } catch {
      setMessage(
        confirmed
          ? 'Operação concluída. Atualize a tela.'
          : 'Resultado não confirmado. Atualize a tela antes de repetir.'
      )
    } finally {
      setBusy(false)
    }
  }

  function patch(
    index: number,
    value: Partial<CampaignItem>
  ) {
    setItems(previous =>
      previous.map((item, position) =>
        position === index
          ? { ...item, ...value }
          : item
      )
    )

    changed()
  }

  function dateFields(
    value: string,
    setValue: (value: string) => void,
    label: string,
    disabled: boolean
  ) {
    const [date = '', time = ''] = value.split('T')

    return (
      <fieldset
        disabled={disabled}
        className="min-w-0"
      >
        <legend className="text-xs font-medium">
          {label} · Brasília
        </legend>

        <div className="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,110px)] gap-3">
          <label className="min-w-0 text-xs">
            Data

            <input
              type="date"
              required={!disabled}
              value={date}
              onChange={event => {
                setValue(
                  event.target.value +
                  'T' +
                  (time || '00:00')
                )
                changed()
              }}
              className={field}
            />
          </label>

          <label className="min-w-0 text-xs">
            Hora

            <input
              type="time"
              required={!disabled}
              value={time}
              onChange={event => {
                setValue(
                  date + 'T' + event.target.value
                )
                changed()
              }}
              className={field}
            />
          </label>
        </div>
      </fieldset>
    )
  }

  return (
    <section className="min-w-0 rounded-3xl border border-[#E5DED3] bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium">
            {saved ? saved.name : 'Nova campanha'}
          </h2>

          <span className="mt-2 inline-block rounded-full bg-[#F5EFE5] px-3 py-1 text-xs">
            {saved
              ? campaignPhase(saved)
              : 'Ainda não salva'}
          </span>
        </div>

        {saved && (
          <Link
            href="/admin/campanhas"
            className="text-xs underline"
          >
            Nova campanha
          </Link>
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[#756B5D]">
        Campanhas podem compartilhar produtos.
        O cliente recebe o menor preço vigente,
        sem somar descontos entre essas campanhas de preço. O desconto progressivo da loja
        e o benefício no Pix seguem suas próprias regras.
      </p>

      <form
        className="mt-6"
        onSubmit={event => {
          event.preventDefault()
          void save()
        }}
      >
        <fieldset
          disabled={busy || !editable}
          className="min-w-0"
        >
          <label className="block text-xs">
            Nome da campanha

            <input
              required
              maxLength={120}
              value={name}
              onChange={event => {
                setName(event.target.value)
                changed()
              }}
              className={field}
            />
          </label>

          {editable && (
            <label className="mt-5 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={startsNow}
                onChange={event => {
                  setStartsNow(event.target.checked)
                  changed()
                }}
                className="h-4 w-4"
              />

              Usar agora como início ao salvar
            </label>
          )}

          <div className="mt-5 grid min-w-0 items-start gap-5 xl:grid-cols-2">
            {dateFields(
              start,
              setStart,
              'Início',
              startsNow || busy || !editable
            )}

            {dateFields(
              end,
              setEnd,
              'Término',
              busy || !editable
            )}
          </div>

          <p className="mt-3 text-xs text-[#81796C]">
            {startsNow
              ? 'O início será registrado ao salvar. '
              : ''}
            Salvar não ativa descontos.
            Publique depois de conferir.
          </p>
        </fieldset>

        {editable && (
          <div className="mt-7 rounded-2xl border border-[#E5DED3] p-4">
            <div className="mb-6 border-b border-[#E5DED3] pb-5">
              <h3 className="text-sm font-medium">Promoção por material</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#81796C]">Carregue as peças publicadas e as variações ativas com preço normal válido. Confira os participantes e escolha o desconto abaixo. Titânio e titânio grau implante/ASTM F136 entram na seleção de titânio natural. Titânio revestido fica separado. Novas peças cadastradas depois não entram automaticamente.</p>
              {materialError && <p role="alert" className="mt-2 text-xs">{materialError}</p>}
              <label className="mt-3 block text-xs">Material
                <select disabled={busy} value={material} onChange={event=>{setMaterial(event.target.value);setTargets([]);setSelected([]);setMessage('')}} className={field}>
                  <option value="">Selecionar material</option>
                  {materials.map(value=><option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <button type="button" disabled={busy || !material} onClick={chooseMaterial} className={button+' mt-3'}>Carregar peças do material</button>
            </div>
            <div className="mb-6 border-b border-[#E5DED3] pb-5">
              <h3 className="text-sm font-medium">Promoção por categoria</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#81796C]">Carregue os produtos e as variações ativas desta categoria. A seleção usa o cadastro de categorias, sem depender do nome ou do código da peça.</p>
              <label className="mt-3 block text-xs">Categoria
                <select value={category} disabled={busy} onChange={event=>{setCategory(event.target.value);setTargets([]);setSelected([]);setMessage('')}} className={field}>
                  <option value="">Selecionar categoria</option>{categories.map(item=><option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
              </label>
              <button type="button" disabled={busy || !category} onClick={chooseCategory} className={button+' mt-3'}>Carregar peças da categoria</button>
            </div>
            <h3 className="text-sm font-medium">
              Adicionar produtos ou variações
            </h3>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                disabled={busy}
                aria-label="Buscar produto"
                placeholder="Nome ou SKU"
                maxLength={100}
                value={search}
                onChange={event =>
                  setSearch(event.target.value)
                }
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void find()
                  }
                }}
                className={field + ' mt-0 flex-1'}
              />

              <button
                type="button"
                disabled={busy}
                onClick={() => void find()}
                className={button}
              >
                Buscar
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {products.map(product => (
                <button
                  type="button"
                  key={product.id}
                  disabled={busy}
                  onClick={() =>
                    void choose(product.id)
                  }
                  className="block w-full rounded-xl border p-3 text-left text-xs"
                >
                  <strong>{product.name}</strong>

                  <span className="mt-1 block text-[#81796C]">
                    {product.sku || 'Sem SKU'}
                    {' · '}
                    {product.productType === 'variable'
                      ? 'Escolher variações'
                      : 'Escolher produto'}
                  </span>
                </button>
              ))}
            </div>

            {targets.length > 0 && (
              <div className="mt-4 rounded-xl bg-[#F8F5EF] p-4">
                <h4 className="text-sm font-medium">
                  {targetHeading || targets[0].productName}
                </h4>

                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <button
                    type="button"
                    disabled={busy}
                    className="underline"
                    onClick={() =>
                      setSelected(
                        targets
                          .filter(target =>
                            target.regularPrice !== null &&
                            target.regularPrice > 0
                          )
                          .map(targetKey)
                      )
                    }
                  >
                    Selecionar todas elegíveis
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    className="underline"
                    onClick={() => setSelected([])}
                  >
                    Desmarcar todas
                  </button>
                </div>

                <div className="mt-3 max-h-64 space-y-2 overflow-auto">
                  {targets.slice(visibleTargetPage*50,(visibleTargetPage+1)*50).map(target => {
                    const key = targetKey(target)

                    return (
                      <label
                        key={key}
                        className="flex gap-3 rounded-lg bg-white p-3 text-xs"
                      >
                        <input
                          type="checkbox"
                          disabled={
                            busy ||
                            target.regularPrice === null ||
                            target.regularPrice <= 0
                          }
                          checked={selected.includes(key)}
                          onChange={event => {
                            const checked =
                              event.target.checked

                            setSelected(previous => {
                              if (!checked) {
                                return previous.filter(
                                  value => value !== key
                                )
                              }

                              return previous.includes(key)
                                ? previous
                                : [...previous, key]
                            })
                          }}
                          className="h-4 w-4 shrink-0"
                        />

                        <span>
                          {target.productName}{target.variantName ? ` — ${target.variantName}` : ''}

                          <span className="mt-1 block">
                            {formatMoney(
                              target.regularPrice
                            )}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>

                <CampaignPager page={visibleTargetPage} total={targets.length} onPage={setTargetPage}/>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="min-w-0 text-xs">
                    Tipo

                    <select
                      disabled={busy}
                      value={kind}
                      onChange={event =>
                        setKind(
                          event.target.value as
                            'percent' | 'fixed'
                        )
                      }
                      className={field}
                    >
                      <option value="percent">
                        Percentual (%)
                      </option>

                      <option value="fixed">
                        Descontar em reais (R$)
                      </option>
                    </select>
                  </label>

                  <label className="min-w-0 text-xs">
                    Desconto

                    <input
                      disabled={busy}
                      maxLength={30}
                      inputMode="decimal"
                      value={discount}
                      onChange={event =>
                        setDiscount(event.target.value)
                      }
                      className={field}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  disabled={
                    busy || !selected.length
                  }
                  onClick={add}
                  className={button + ' mt-4'}
                >
                  Adicionar selecionados
                </button>
              </div>
            )}
          </div>
        )}

        <h3 className="mt-7 text-sm font-medium">
          Participantes · {items.length}
        </h3>

        <label className="mt-4 block text-xs">Buscar nos participantes
          <input type="search" aria-label="Buscar nos participantes" placeholder="Nome, referência/SKU ou variação" value={participantSearch} disabled={busy} onChange={event=>{setParticipantSearch(event.target.value);setItemPage(0)}} onKeyDown={event=>{if(event.key==='Enter')event.preventDefault()}} className={field}/>
        </label>
        {participantSearch.trim() && <p role="status" className="mt-2 text-xs">{filteredItems.length} encontrado(s) de {items.length} participantes nesta campanha.</p>}
        {items.length>0 && filteredItems.length===0 && <p className="mt-3 text-sm">Nenhum participante encontrado nesta campanha. Confira o nome ou a referência, ou limpe a busca.</p>}
        {!items.length && (
          <p className="mt-3 text-xs">
            Nenhum participante adicionado.
          </p>
        )}

        <CampaignPager page={visibleItemPage} total={filteredItems.length} onPage={setItemPage}/>
        <div className="mt-3 space-y-3">
          {filteredItems.slice(visibleItemPage*50,(visibleItemPage+1)*50).map(({item,index}) => {
            const price = editable
              ? preview(item)
              : item.appliedSalePrice

            return (
              <div
                key={targetKey(item)}
                className="rounded-2xl border border-[#E5DED3] p-4"
              >
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {item.productName}
                    </p>

                    <p className="mt-1 text-xs">
                      {item.variantName}
                    </p>
                    {(item.productSku || item.variantSku) && <p className="mt-1 text-xs text-[#81796C]">Referência: {Array.from(new Set([item.productSku,item.variantSku].filter(Boolean))).join(' · ')}</p>}
                  </div>

                  {editable && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setItems(previous =>
                          previous.filter(
                            (_, position) =>
                              position !== index
                          )
                        )
                        changed()
                      }}
                      className="text-xs text-red-700 underline"
                    >
                      Remover
                    </button>
                  )}
                </div>

                <fieldset
                  disabled={busy || !editable}
                  className="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  <label className="min-w-0 text-xs">
                    Tipo

                    <select
                      value={item.discountType}
                      onChange={event =>
                        patch(index, {
                          discountType:
                            event.target.value as
                              'percent' | 'fixed',
                        })
                      }
                      className={field}
                    >
                      <option value="percent">
                        Percentual (%)
                      </option>

                      <option value="fixed">
                        Descontar em reais (R$)
                      </option>
                    </select>
                  </label>

                  <label className="min-w-0 text-xs">
                    Desconto

                    <input
                      maxLength={30}
                      inputMode="decimal"
                      value={item.discountValue}
                      onChange={event =>
                        patch(index, {
                          discountValue:
                            event.target.value,
                        })
                      }
                      aria-invalid={
                        editable && price === null
                          ? true
                          : undefined
                      }
                      className={
                        field +
                        (
                          editable && price === null
                            ? ' border-red-600'
                            : ''
                        )
                      }
                    />
                  </label>
                </fieldset>

                <p className="mt-4 rounded-xl bg-[#F8F5EF] p-3 text-xs">
                  Normal:{' '}
                  {formatMoney(item.regularPrice)}
                  {' · '}
                  Preço desta campanha:{' '}

                  <strong>
                    {price === null
                      ? 'Confira o desconto'
                      : formatMoney(price)}
                  </strong>
                </p>

                <p className="mt-2 text-[11px] text-[#81796C]">
                  Outra promoção vigente pode oferecer
                  um preço ainda menor.
                </p>
              </div>
            )
          })}
        </div>

        <CampaignPager page={visibleItemPage} total={filteredItems.length} onPage={setItemPage}/>
        {editable && (
          <div className="mt-7 border-t pt-5">
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={
                  busy ||
                  !items.length ||
                  invalid
                }
                className="min-h-[44px] rounded-full bg-[#292621] px-6 py-3 text-xs text-white disabled:opacity-40"
              >
                Salvar rascunho
              </button>

              <button
                type="button"
                disabled={
                  busy ||
                  !saved ||
                  dirty ||
                  !items.length ||
                  invalid
                }
                onClick={() => void run('publish')}
                className={button}
              >
                Publicar campanha
              </button>
            </div>

            <p className="mt-3 text-xs">
              {!saved
                ? 'Salve antes de publicar.'
                : dirty
                  ? 'Existem alterações não salvas.'
                  : 'Confira o período e os preços antes de publicar.'}
            </p>
          </div>
        )}
      </form>

      {saved &&
        saved.status !== 'cancelled' &&
        !ended && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('cancel')}
            className="mt-5 text-xs text-red-700 underline"
          >
            Cancelar{' '}
            {saved.status === 'draft'
              ? 'rascunho'
              : 'campanha'}
          </button>
        )}

      {saved?.status==='published' && !ended && <section className="mt-6 rounded-2xl border border-[#E5DED3] bg-[#F8F5EF] p-4">
        <h3 className="text-sm font-medium">Completar a seleção por material</h3>
        <p className="mt-2 text-xs leading-5">Crie uma versão atualizada com os participantes atuais e as peças que faltam, com o mesmo desconto e término. Titânio grau implante entra como titânio natural. O rascunho não altera a campanha ativa: confira, publique a nova versão e depois cancele a anterior.</p>
        <label className="mt-3 block text-xs">Material para completar
          <select aria-label="Material para completar a campanha" value={material} disabled={busy} onChange={event=>{setMaterial(event.target.value);setReplacementId('');setCoverage(null);setMessage('')}} className={field}>
            <option value="">Selecionar material</option>{materials.map(value=><option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy || !material} onClick={()=>auditCoverage('material')} className={button+' mt-3 mr-2'}>Conferir peças faltantes por material</button>
        <button type="button" disabled={busy || !material} onClick={()=>prepareUpdatedCampaign('material')} className={button+' mt-3'}>Criar versão com as peças faltantes</button>
        <div className="mt-5 border-t border-[#E5DED3] pt-4">
          <h3 className="text-sm font-medium">Completar a seleção por categoria</h3>
          <label className="mt-3 block text-xs">Categoria para completar
            <select aria-label="Categoria para completar a campanha" value={category} disabled={busy} onChange={event=>{setCategory(event.target.value);setReplacementId('');setCoverage(null);setMessage('')}} className={field}>
              <option value="">Selecionar categoria</option>{categories.map(item=><option key={item.slug} value={item.slug}>{item.name}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy || !category} onClick={()=>auditCoverage('category')} className={button+' mt-3 mr-2'}>Conferir peças faltantes por categoria</button>
          <button type="button" disabled={busy || !category} onClick={()=>prepareUpdatedCampaign('category')} className={button+' mt-3'}>Criar versão com as peças da categoria que faltam</button>
        </div>
        {coverage && <div role="status" className="mt-4 text-xs leading-6">
          <p>{coverage.missing.length} de {coverage.total} participantes elegíveis estão fora desta campanha.</p>
          {coverage.missing.length>0 && <><ul className="mt-2 list-disc pl-5">{coverage.missing.slice(0,20).map(item=><li key={targetKey(item)}>{[item.productSku,item.productName,item.variantName].filter(Boolean).join(' · ')}</li>)}</ul>{coverage.missing.length>20 && <p>Mostrando 20 de {coverage.missing.length}. A nova versão incluirá todas as peças faltantes.</p>}</>}
        </div>}
      </section>}
      {saved?.status === 'published' && (
        <p className="mt-4 text-xs">
          {ended
            ? 'Campanha encerrada.'
            : 'Campanha publicada.'}
          {' '}
          O menor preço vigente é escolhido
          automaticamente.
        </p>
      )}

      <p
        role="status"
        className="mt-5 text-sm leading-relaxed"
      >
        {busy ? 'Processando…' : message}
      </p>

      {id && (
        <Link
          href={'/admin/campanhas?edit=' + id}
          className="mt-3 inline-block text-xs underline"
        >
          Abrir dados salvos
        </Link>
      )}
    </section>
  )
}
