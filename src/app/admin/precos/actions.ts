'use server'
import { adminDatabase } from '@/lib/admin-auth'
import { revalidateTag, revalidatePath } from 'next/cache'

export type PricePreview = { material:string;percent:number;fingerprint:string;count:number;examples:{name:string;before:number;after:number}[] }
export async function materialPrices(material:string,percent:number,batch?:string,expected?:string):Promise<{preview?:PricePreview;error?:string}> {
  const {db,user}=await adminDatabase()
  if(typeof material!=='string' || !material.trim() || material.length>180 || !Number.isFinite(percent) || percent===0 || percent < -90 || percent>500 || Math.abs(Math.round(percent*100)-percent*100)>0.000001 || (batch!==undefined && (!/^[a-f0-9-]{36}$/i.test(batch) || typeof expected!=='string' || !/^[a-f0-9]{32}$/.test(expected)))) return {error:'Confira o material e o percentual. Use até duas casas decimais.'}
  const {data,error}=await db.rpc('serenity_material_prices_v1',{p_material:material,p_percent:percent,p_actor:batch?user.id:null,p_batch:batch || null,p_expected:expected || null})
  if(error) return {error:error.message.includes('MATERIAL_PRICE_STALE')?'Os preços mudaram. Gere uma nova prévia antes de aplicar.':error.message.includes('MATERIAL_PRICE_EMPTY')?'Nenhuma joia publicada com preço disponível neste material.':'Não foi possível aplicar. Confira a instalação do SQL e se existem campanhas protegendo esses preços.'}
  if(batch){revalidateTag('catalog');revalidatePath('/google-merchant.xml');revalidatePath('/admin/precos')}
  return {preview:data as PricePreview}
}

export type CategoryPricePreview = Omit<PricePreview,'material'> & {category:string}
export async function categoryPrices(category:string,percent:number,batch?:string,expected?:string):Promise<{preview?:CategoryPricePreview;error?:string}> {
 const {db,user}=await adminDatabase()
 if(typeof category!=='string' || !category.trim() || category.length>180 || !Number.isFinite(percent) || percent===0 || percent < -90 || percent>500 || Math.abs(Math.round(percent*100)-percent*100)>0.000001 || (batch!==undefined && (!/^[a-f0-9-]{36}$/i.test(batch) || typeof expected!=='string' || !/^[a-f0-9]{32}$/.test(expected)))) return {error:'Confira a categoria e o percentual. Use até duas casas decimais.'}
 const {data,error}=await db.rpc('serenity_category_prices_v1',{p_category:category,p_percent:percent,p_actor:batch?user.id:null,p_batch:batch || null,p_expected:expected || null})
 if(error) return {error:error.message.includes('CATEGORY_PRICE_STALE')?'Os preços mudaram. Gere uma nova prévia antes de aplicar.':error.message.includes('CATEGORY_PRICE_EMPTY')?'Nenhum produto publicado com preço disponível nesta categoria.':'Não foi possível aplicar. Confira a instalação do SQL e se existem campanhas protegendo esses preços.'}
 if(batch){revalidateTag('catalog');revalidatePath('/google-merchant.xml');revalidatePath('/admin/precos')}
 return {preview:data as CategoryPricePreview}
}

export async function undoPrices(kind:'material'|'category',batch:string):Promise<{error?:string}> {
 const {db,user}=await adminDatabase()
 if(!['material','category'].includes(kind) || typeof batch!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(batch)) return {error:'Reajuste inválido.'}
 const {error}=await db.rpc('serenity_undo_prices_v1',{p_kind:kind,p_batch:batch,p_actor:user.id})
 if(error) return {error:error.message.includes('PRICE_UNDO_CHANGED')?'Os preços mudaram depois deste reajuste. Desfaça primeiro os reajustes mais recentes ou confira as edições feitas nos produtos.':error.message.includes('PRICE_UNDO_NOT_FOUND')?'Reajuste não encontrado. Atualize o histórico.':'Não foi possível desfazer. Confira a instalação da atualização de preços no banco e tente novamente.'}
 revalidateTag('catalog');revalidatePath('/google-merchant.xml');revalidatePath('/admin/precos')
 return {}
}
