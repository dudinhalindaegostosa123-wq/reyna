import { DEFAULT_COMMERCE_POLICY,isStem,isTopProduct,isMicrodermalProduct,supportsSterilization,sterilizationChoiceLabel,type CommercePolicy } from './commerce'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { resolveProductSelection } from '@/lib/data'
import type { Product } from '@/lib/data'
import { projectCart } from './ready-project'
import type { ProjectPiece } from './ready-project'
import { anodizedPrice, getAnodization } from './anodization'

export interface CartItem {
  originalName?: string
  id: string
  productId: string
  variationId?: string
  sterilized?: boolean
  sterilizationFee?: number
  stemFee?: number
  stem?: string
  requiresStem?: boolean
  stemLocked?: boolean
  slug: string
  name: string
  price: number
  basePrice?: number
  anodization?: {
    code: string
    label: string
    fee: number
  }
  image: string
  quantity: number
  stock: number | null
  variants: Record<string, string>
  variantKey: string
}

interface CartStore {
  commercePolicy: CommercePolicy
  applyCommercePolicy: (policy: CommercePolicy) => void
  setStem: (key: string, stem: string) => void
  setSterilized: (key: string, value: boolean) => void
  applyCanonicalQuote: (lines: {slug:string;cart_variant?:string;sterilized?:boolean;sterilization_fee?:number;stem_fee?:number;stem?:string;stem_locked?:boolean;variation?:string|null;color:string;quantity:number;unit_price:number;fee:number}[]) => void
  items: CartItem[]
  isOpen: boolean
  addItem: (
    product: Product,
    quantity: number,
    selectedVariants: Record<string, string>,
    anodizationColor?: string,
    stem?: string,
    sterilized?: boolean
  ) => boolean
  addProject: (pieces: ProjectPiece[]) => boolean
  removeItem: (variantKey: string) => void
  updateQuantity: (variantKey: string, quantity: number) => void
  clearCart: () => void
  openCart: () => void
  closeCart: () => void
  total: () => number
  itemCount: () => number
}

const sameSelection = (
  item: CartItem,
  productId: string,
  variationId?: string
) =>
  item.productId === productId &&
  (item.variationId || '') === (variationId || '')

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      commercePolicy: DEFAULT_COMMERCE_POLICY,
      applyCommercePolicy: (policy) => set(state => {
        if (!Number.isSafeInteger(policy.version) || policy.version < state.commercePolicy.version || ![0,15].includes(policy.anodization_fee)) return state
        return {commercePolicy:policy,items:state.items.map(item=>{
          const addon=item.anodization ? {...item.anodization,fee:policy.anodization_fee}:undefined
          const basePrice=item.basePrice ?? Math.max(0,item.price-(item.anodization?.fee || 0)-(item.sterilizationFee || 0)-(item.stemFee || 0))
          const sterilizationFee=item.sterilized && [5,10].includes(policy.sterilization_fee || 0) ? policy.sterilization_fee! : 0
          const stemFee=item.stem && !isMicrodermalProduct(item) ? 5 : 0
          const variants={...item.variants}
          if(addon) variants.Anodização=`${addon.label} (${addon.fee===0?'gratuita':'+ R$ 15,00 por unidade'})`
          if(item.stem && stemFee>0) variants['Haste incluída']=`${item.stem} mm (+ R$ 5,00 por peça)`
          if(typeof item.sterilized==='boolean') variants['Esterilização solicitada']=item.sterilized?sterilizationChoiceLabel(sterilizationFee):'Não'
          if(policy.preparation_options && isMicrodermalProduct(item)) delete variants['Haste incluída']
          return {...item,basePrice,sterilizationFee,stemFee,price:anodizedPrice(basePrice,addon?.fee || 0)+sterilizationFee+stemFee,variants,...(addon?{anodization:addon}:{}),...(policy.preparation_options && isMicrodermalProduct(item)?{requiresStem:false,stem:undefined,stemLocked:false}:policy.included_stems && isTopProduct(item)?{requiresStem:true}:{})}
        })}
      }),
      setSterilized: (key,value) => {
        if(typeof value!=='boolean' || !get().commercePolicy.preparation_options) return
        set(state=>{
          const item=state.items.find(row=>row.variantKey===key)
          if(!item || !supportsSterilization(item,get().commercePolicy.sterilization_all_products)) return state
          const nextKey=JSON.stringify([item.productId,item.variationId || '',...(item.anodization?['anodization',item.anodization.code]:[]),...(item.stem?['stem',item.stem]:[]),'sterilized',value])
          const other=state.items.find(row=>row.variantKey===nextKey && row.variantKey!==key)
          const sterilizationFee=value && [5,10].includes(get().commercePolicy.sterilization_fee || 0) ? get().commercePolicy.sterilization_fee! : 0
          const basePrice=item.basePrice ?? Math.max(0,item.price-(item.anodization?.fee || 0)-(item.sterilizationFee || 0)-(item.stemFee || 0))
          const replacement={...item,id:nextKey,variantKey:nextKey,sterilized:value,sterilizationFee,basePrice,price:anodizedPrice(basePrice,item.anodization?.fee || 0)+sterilizationFee+(item.stemFee || 0),variants:{...item.variants,'Esterilização solicitada':value?sterilizationChoiceLabel(sterilizationFee):'Não'},quantity:item.quantity+(other?.quantity || 0)}
          return {items:state.items.filter(row=>row.variantKey!==nextKey || row.variantKey===key).map(row=>row.variantKey===key?replacement:row)}
        })
      },
      setStem: (key,stem) => {
        if(stem!=='' && !['6','8'].includes(stem)) return
        set(state=>{
          const item=state.items.find(item=>item.variantKey===key)
          if(!item?.requiresStem || item.stemLocked) return state
          const nextKey=JSON.stringify([item.productId,item.variationId || '',...(item.anodization?['anodization',item.anodization.code]:[]),...(stem?['stem',stem]:[]),...(typeof item.sterilized==='boolean'?['sterilized',item.sterilized]:[])])
          const other=state.items.find(item=>item.variantKey===nextKey && item.variantKey!==key)
          const basePrice=item.basePrice ?? Math.max(0,item.price-(item.anodization?.fee || 0)-(item.sterilizationFee || 0)-(item.stemFee || 0))
          const stemFee=stem ? 5 : 0
          const replacement={...item,id:nextKey,variantKey:nextKey,stem,stemFee,basePrice,price:basePrice+(item.anodization?.fee || 0)+(item.sterilizationFee || 0)+stemFee,variants:{...Object.fromEntries(Object.entries(item.variants).filter(([key])=>key!=='Haste incluída')),...(stem?{'Haste incluída':`${stem} mm (+ R$ 5,00 por peça)`}:{})},quantity:item.quantity+(other?.quantity || 0)}
          return {items:state.items.filter(row=>row.variantKey!==nextKey || row.variantKey===key).map(row=>row.variantKey===key?replacement:row)}
        })
      },
      applyCanonicalQuote: lines => set(state=>{
        const result=new Map<string,CartItem>()
        for(const item of state.items){
          const line=lines.find(line=>line.slug===item.slug && line.cart_variant===(item.variationId || '') && (line.color || '')===(item.anodization?.code || '') && ((line.stem || '')===(item.stem || '') || line.stem_locked && (!item.stem || item.stemLocked)) && line.quantity===item.quantity && line.sterilized===item.sterilized)
          let next=item
          if(line && Number.isFinite(line.unit_price) && line.unit_price>=0 && [0,15].includes(line.fee) && [0,5,10].includes(line.sterilization_fee || 0) && [0,5].includes(line.stem_fee || 0)){
            const addon=item.anodization?{...item.anodization,fee:line.fee}:undefined
            const key=line.stem_locked?JSON.stringify([item.productId,item.variationId || '',...(addon?['anodization',addon.code]:[]),'stem',line.stem,...(typeof item.sterilized==='boolean'?['sterilized',item.sterilized]:[])]):item.variantKey
            next={...item,id:key,variantKey:key,basePrice:line.unit_price,sterilizationFee:line.sterilization_fee || 0,stemFee:line.stem_fee || 0,price:anodizedPrice(line.unit_price,line.fee)+(line.sterilization_fee || 0)+(line.stem_fee || 0),...(line.stem_locked?{stem:line.stem,stemLocked:true,requiresStem:true}:{}),...(addon?{anodization:addon}:{}),variants:{...item.variants,...(typeof item.sterilized==='boolean'?{'Esterilização solicitada':item.sterilized?sterilizationChoiceLabel(line.sterilization_fee || 0):'Não'}:{}),...(line.stem_locked?{'Haste incluída':`${line.stem} mm${line.stem_fee ? ' (+ R$ 5,00 por peça)' : ''}`,...(typeof line.variation==='string'?{Variação:line.variation.replace(/(?:^| · )Haste incluída: (?:4|6|8|10) mm$/,'').trim()}:{})}:{}),...(addon?{Anodização:`${addon.label} (${addon.fee===0?'gratuita':'+ R$ 15,00 por unidade'})`}:{})}}
          }
          const existing=result.get(next.variantKey)
          result.set(next.variantKey,existing?{...next,quantity:existing.quantity+next.quantity}:next)
        }
        return {items:Array.from(result.values())}
      }),
      isOpen: false,

      addItem: (
        product,
        quantity,
        selectedVariants,
        anodizationColor,
        stem,
        sterilized
      ) => {
        const selection = resolveProductSelection(
          product,
          selectedVariants
        )

        if (
          !selection ||
          !selection.inStock ||
          !selection.priceAvailable ||
          !Number.isFinite(selection.price) ||
          selection.price < 0 ||
          !Number.isFinite(quantity) ||
          quantity < 1
        ) return false

        if(selection.stemLength){if(stem && stem!==selection.stemLength)return false;stem=selection.stemLength}
        let addon: ReturnType<typeof getAnodization>

        try {
          addon = getAnodization(product.tags, anodizationColor, get().commercePolicy.version>0?get().commercePolicy.anodization_fee:product.anodizationFee)
        } catch {
          return false
        }

        const variationId = product.variations
          ? selection.id
          : undefined

        const preparation = product.preparationOptions || get().commercePolicy.preparation_options
        if(sterilized !== undefined && (!preparation || !supportsSterilization(product,product.preparationAllProducts || get().commercePolicy.sterilization_all_products) || typeof sterilized!=='boolean')) return false
        const includesStem = !(preparation && isMicrodermalProduct(product)) && (product.includesStem || get().commercePolicy.included_stems && isTopProduct(product))
        if(stem && (!includesStem || !isStem(stem))) return false
        const variantKey = JSON.stringify([product.id,variationId || '',...(addon?['anodization',addon.code]:[]),...(stem?['stem',stem]:[]),...(typeof sterilized==='boolean'?['sterilized',sterilized]:[])])

        const existing = get().items.find(
          (item) => item.variantKey === variantKey
        )

        const otherQuantity = get().items
          .filter(
            (item) =>
              item.variantKey !== variantKey &&
              sameSelection(item, product.id, variationId)
          )
          .reduce((total, item) => total + item.quantity, 0)

        const wanted =
          (existing?.quantity || 0) + Math.floor(quantity)

        const allowed = selection.stock === null
          ? wanted
          : Math.min(
              wanted,
              Math.max(0, selection.stock - otherQuantity)
            )

        if (allowed <= (existing?.quantity || 0)) return false

        const variants: Record<string, string> = {}

        if (variationId) variants['Variação'] = selection.name
        if (addon) {
          variants['Anodização'] =
            `${addon.label} (${addon.fee===0?'gratuita':'+ R$ 15,00 por unidade'})`
        }

        const sterilizationFee=sterilized && [5,10].includes(product.sterilizationFee ?? get().commercePolicy.sterilization_fee ?? 0) ? (product.sterilizationFee ?? get().commercePolicy.sterilization_fee)! : 0
        if(typeof sterilized==='boolean') variants['Esterilização solicitada']=sterilized?sterilizationChoiceLabel(sterilizationFee):'Não'
        if(stem) variants['Haste incluída']=`${stem} mm (+ R$ 5,00 por peça)`
        const item: CartItem = {
          id: existing?.id || variantKey,
          productId: product.id,
          variationId,
          ...(typeof sterilized==='boolean'?{sterilized}:{}),
          ...(includesStem?{requiresStem:true}:{}),
          ...(stem?{stem}:{}),
          ...(selection.stemLength?{stemLocked:true}:{}),
          slug: product.slug,
          name: product.name,
          originalName: product.originalName,
          price: anodizedPrice(selection.price, addon?.fee || 0)+sterilizationFee+(stem ? 5 : 0),
          sterilizationFee,
          stemFee: stem ? 5 : 0,
          basePrice: selection.price,
          anodization: addon || undefined,
          image: selection.image || product.images[0] || '',
          quantity: allowed,
          stock: selection.stock,
          variants,
          variantKey,
        }

        set((state) => ({
          items: existing
            ? state.items.map((current) =>
                current.variantKey === variantKey ? item : current
              )
            : [...state.items, item],
        }))

        return true
      },

      addProject: (pieces) => {
        const items = projectCart(get().items, pieces)
        if (!items) return false
        set({ items:items.map(item=>get().commercePolicy.included_stems && isTopProduct(item) && !(get().commercePolicy.preparation_options && isMicrodermalProduct(item))?{...item,requiresStem:true}:item), isOpen: true })
        return true
      },

      removeItem: (variantKey) =>
        set((state) => ({
          items: state.items.filter(
            (item) => item.variantKey !== variantKey
          ),
        })),

      updateQuantity: (variantKey, quantity) => {
        if (!Number.isFinite(quantity)) return

        if (quantity <= 0) {
          get().removeItem(variantKey)
          return
        }

        set((state) => ({
          items: state.items
            .map((item) => {
              if (item.variantKey !== variantKey) return item

              const others = state.items
                .filter(
                  (other) =>
                    other.variantKey !== variantKey &&
                    sameSelection(
                      other,
                      item.productId,
                      item.variationId
                    )
                )
                .reduce(
                  (total, other) => total + other.quantity,
                  0
                )

              const requested = Math.max(1, Math.floor(quantity))

              return {
                ...item,
                quantity: item.stock === null
                  ? requested
                  : Math.min(
                      requested,
                      Math.max(0, item.stock - others)
                    ),
              }
            })
            .filter((item) => item.quantity > 0),
        }))
      },

      clearCart: () => set({ items: [] }),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),

      total: () =>
        get().items.reduce(
          (total, item) => total + item.price * item.quantity,
          0
        ),

      itemCount: () =>
        get().items.reduce(
          (total, item) => total + item.quantity,
          0
        ),
    }),
    {
      name: 'serenity-cart',
      version: 2,
      partialize: (state) => ({ items: state.items }),
      migrate: () => ({ items: [] }),
    }
  )
)
