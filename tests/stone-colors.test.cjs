const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load } = require('./helpers/load.cjs')
const { renderer, nodes } = require('./helpers/render.cjs')
const colors = load('src/lib/stone-colors.ts')
const area = load('src/lib/catalog-area.ts', {
    ...require('./helpers/commerce.cjs'),
  './data': { plainText: value => value }, './catalog-server': {}, './wholesale-server': {},
})
const list = value => Array.from(value).sort()

test('stone colors distinguish metal, measurements and accessory colors from stones', () => {
  assert.deepEqual(list(colors.namedStoneColors('Topo Zircônia Verde Esmeralda - Titânio Revestido de Ouro 18k')), ['verde'])
  assert.deepEqual(list(colors.namedStoneColors('Argola - Titânio PVD Black')), [])
  assert.deepEqual(list(colors.stoneAttributeColors({ 'Cor do Porta Joias': 'Rosa', 'Cor da Pinça': 'Preto', 'Cor do metal': 'Black', 'Tamanho da Pedra': '2mm' })), [])
  assert.deepEqual(list(colors.stoneAttributeColors({ Cor: 'Black' }, 'Haste Titânio Black')), [])
  assert.deepEqual(list(colors.stoneAttributeColors({ 'Cor das Pedras': 'Rosa Pink' }, 'Topo de Zircônia')), ['rosa'])
  assert.deepEqual(list(colors.namedStoneColors('Topo Zircônia Colors - Titânio')), [])
  assert.deepEqual(list(colors.stoneColorIds('Swarovski Acqua Blue')), ['turquesa'])
  assert.deepEqual(list(colors.stoneColorIds('Black & White')), ['cristal', 'preto'])
  assert.deepEqual(list(colors.stoneColorIds('Dark lavender & coffee')), ['marrom', 'roxo'])
})

function fixture(overrides=[]) {
  const calls = []
  const server = load('src/lib/stone-collections-server.ts', {
    './stone-definitions-server':{getStoneDefinitions:async()=>colors.STONE_COLORS}, './stone-colors': colors, './catalog-area': area, './stone-overrides-server':{getStoneOverrides:async()=>overrides},
    './catalog-server': {
      getStoneCatalogMetadata: async () => ({
        products: [
          { database_id: 'a', id: '10', name: 'Topo Zircônia Colors', category_slugs: ['conch'], material: 'Titânio' },
          { database_id: 'b', id: '20', name: 'Argola Rubi', category_slugs: ['septo'], material: 'Ouro' },
          { database_id: 'c', id: '30', name: 'Topo Esmeralda', category_slugs: ['orelha-helix'], material: 'Ouro' },
          { database_id: 'd', id: '40', name: 'Haste PVD Black', category_slugs: ['hastes'], material: 'Titânio' },
        ],
        variants: [
          { product_id: 'a', attributes: { 'Cor das Pedras': 'Verde' } },
          { product_id: 'a', attributes: { 'Cor das Pedras': 'Verde' } },
          { product_id: 'a', attributes: { 'Cor das Pedras': 'Rubi' } },
          { product_id: 'hidden', attributes: { 'Cor das Pedras': 'Rosa' } },
          { product_id: 'd', attributes: { Cor: 'Black' } },
        ],
      }),
      getStorePage: async options => { calls.push(options); return { products: [], total: options.productIds.length, page: 1, totalPages: 1 } },
    },
  })
  return { server, calls }
}

test('collections deduplicate parents and discover variant colors without exposing hidden products', async () => {
  const { server } = fixture()
  const groups = await server.getStoneCollections()
  assert.deepEqual(Array.from(groups, group => group.id), ['verde', 'vermelho'])
  assert.deepEqual(Array.from(groups[0].products, product => product.id), ['10', '30'])
})

test('category and subcategory intersect the chosen color before pagination or price sorting', async () => {
  const { server, calls } = fixture()
  const groups = await server.getStoneCollections()
  const green = groups.find(group => group.id === 'verde')
  const options = { area: 'orelha', subarea: 'conch', material: 'all', sort: 'price-desc', page: 3 }
  const result = await server.getStonePage(green, options)
  assert.deepEqual(Array.from(calls[0].productIds), ['10'])
  assert.equal(calls[0].sort, 'price-desc')
  assert.equal(calls[0].page, 3)
  assert.deepEqual(Array.from(result.materials), ['Titânio'])
  await server.getStonePage(green, { ...options, area: 'nariz', subarea: 'septo' })
  assert.equal(calls[1].productIds.length, 0)
  assert.equal(area.matchesAreaSelection(['orelha-helix'], 'orelha', 'helix'), true)
  assert.equal(area.normalizeSubarea('nariz', 'conch'), 'all')
})

test('carousel renders photo-free circles with links and supports moving the horizontal track', () => {
  const effects = []
  let onScroll
  const view = renderer('src/components/home/StoneColorCarousel.tsx', {
    'next/image': {default:'Image'},
    'next/link': { default: 'link' }, 'lucide-react': { ChevronLeft: 'left', ChevronRight: 'right' },
  }, { ResizeObserver: class { observe() {} disconnect() {} }, window: { matchMedia: () => ({ matches: true }) } })
  const props = { colors: [{ id: 'verde', name: 'Verde', color: '#17654D' }, { id: 'rosa', name: 'Rosa', color: '#D78BA5' }], selected: 'verde' }
  let tree = view.render(props)
  assert.equal(nodes(tree, node => node.type === 'img').length, 0)
  const links = nodes(tree, node => node.props.href)
  assert.equal(links[0].props.href, '/cores/verde')
  assert.equal(links[0].props['aria-current'], 'page')
  const track = nodes(tree, node => node.props.ref)[0]
  track.props.ref.current = { scrollLeft: 0, clientWidth: 200, scrollWidth: 800, addEventListener(event,fn) { if(event==='scroll')onScroll=fn }, removeEventListener() {}, scrollBy: value => effects.push(value) }
  view.flush()
  tree = view.render(props)
  const next = nodes(tree, node => node.props['aria-label'] === 'Ver próximas cores')[0]
  assert.equal(next.props.disabled, false)
  next.props.onClick()
  assert.equal(effects[0].left, 200)
  assert.equal(effects[0].behavior, 'auto')
  const previous=nodes(tree,node=>node.props['aria-label']==='Ver cores anteriores')[0]
  assert.equal(previous.props.disabled,true)
  track.props.ref.current.scrollLeft=600;onScroll();tree=view.render(props)
  assert.equal(nodes(tree,node=>node.props['aria-label']==='Ver próximas cores')[0].props.disabled,true)
  const back=nodes(tree,node=>node.props['aria-label']==='Ver cores anteriores')[0]
  assert.equal(back.props.disabled,false);back.props.onClick();assert.equal(effects[1].left,-200)
  const order=nodes(tree,node=>node.type==='button' || node.type==='link')
  assert.equal(order[0].props['aria-label'],'Ver cores anteriores')
  assert.equal(order.at(-1).props['aria-label'],'Ver próximas cores')
})

test('manual membership wins over inference, exclusions persist and empty color pages remain manageable',async()=>{
 const {server}=fixture([{color_id:'verde',product_id:'a',included:false},{color_id:'rosa',product_id:'b',included:true},{color_id:'rosa',product_id:'hidden',included:true}])
 const groups=await server.getStoneCollections(true)
 assert.equal(groups.length,13)
 assert.deepEqual(Array.from(groups.find(group=>group.id==='verde').products,product=>product.id),['30'])
 assert.deepEqual(Array.from(groups.find(group=>group.id==='rosa').products,product=>product.id),['20'])
 assert.deepEqual(Array.from(groups.find(group=>group.id==='vermelho').products,product=>product.id),['10','20'])
 assert.equal(groups.find(group=>group.id==='azul').products.length,0)
 const again=await server.getStoneCollections();assert.equal(again.find(group=>group.id==='verde').products.some(product=>product.id==='10'),false)
})
test('color searches find curated products, keep the same selection on pagination and leave metal searches untouched',()=>{
 assert.equal(colors.resolveStoneSearch('verde').color,'verde')
 assert.equal(colors.resolveStoneSearch('verde').search,'')
 assert.equal(colors.resolveStoneSearch('verde','verde').search,'')
 assert.equal(colors.resolveStoneSearch('azul claro').color,'turquesa')
 assert.equal(colors.resolveStoneSearch('safira').color,'azul')
 assert.equal(colors.resolveStoneSearch('','rosa').color,'rosa')
 assert.equal(colors.resolveStoneSearch('argola','azul').search,'argola')
 assert.equal(colors.resolveStoneSearch('ouro rose').color,'')
 assert.deepEqual(list(colors.namedStoneColors('Topo Zircônia Cristal Titânio Black')),['cristal'])
 assert.deepEqual(list(colors.namedStoneColors('Topo Zircônia Cristal Rose Gold')),['cristal'])
})
