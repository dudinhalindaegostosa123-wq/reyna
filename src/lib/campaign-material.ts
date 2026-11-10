import type {SupabaseClient} from '@supabase/supabase-js'
import {readCampaignPages} from './campaign-pagination'
import {matchesCampaignMaterial} from './campaign-material-match'
import type {CampaignTarget} from './promotion-ui'

export function readMaterialCampaignTargets(db:Pick<SupabaseClient,'from'>,material:string) {
 return readTargets(db,product=>matchesCampaignMaterial(product,material),'material')
}
export function readCategoryCampaignTargets(db:Pick<SupabaseClient,'from'>,category:string) {
 const slug=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
 return readTargets(db,product=>(product.categories || []).some(name=>slug(name)===slug(category)),'categoria')
}
async function readTargets(db:Pick<SupabaseClient,'from'>,matches:(product:{material?:string|null;name?:string|null;tags?:string[]|null;categories?:string[]|null})=>boolean,scope:string):Promise<{error:string;targets:CampaignTarget[]}>{
 const targets:CampaignTarget[]=[]
 const price=(value:unknown)=>value!==null && value!==undefined && Number.isFinite(Number(value)) && Number(value)>0?Number(value):null
 try{
  for(let offset=0;;offset+=100){
   const products=await db.from('products').select('id,name,sku,material,tags,categories,product_type,regular_price').eq('status','published').neq('visibility','hidden').order('id').range(offset,offset+99)
   if(products.error)throw Error('PRODUCTS')
   const page=products.data || []
   const rows=page.filter(matches)
   for(const product of rows){
    if(product.product_type==='simple' && price(product.regular_price)!==null)targets.push({productId:product.id,variantId:null,productName:product.name,productSku:product.sku || '',variantName:'',regularPrice:price(product.regular_price)})
   }
   const variable=rows.filter(row=>row.product_type==='variable')
   if(variable.length){
    const variants=await readCampaignPages((from,to)=>db.from('product_variants').select('id,product_id,name,sku,regular_price').in('product_id',variable.map(row=>row.id)).eq('enabled',true).order('id').range(from,to))
    if(variants.error)throw Error('VARIANTS')
    const parents=new Map(variable.map(row=>[row.id,row]))
    for(const variant of variants.data || []){
     if(price(variant.regular_price)===null)continue
     targets.push({productId:variant.product_id,variantId:variant.id,productName:String(parents.get(variant.product_id)?.name),productSku:parents.get(variant.product_id)?.sku || '',variantSku:variant.sku || '',variantName:[variant.name,variant.sku].filter(Boolean).join(' · '),regularPrice:price(variant.regular_price)})
    }
   }
   if(page.length<100)return {error:targets.length?'':`Nenhum produto ou variação com preço normal válido nesta seleção de ${scope}.`,targets}
  }
 }catch{return {error:`Não foi possível carregar a seleção de ${scope}. Tente novamente.`,targets:[]}}
}
