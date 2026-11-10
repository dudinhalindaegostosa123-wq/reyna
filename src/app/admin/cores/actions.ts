'use server'
import { adminDatabase } from '@/lib/admin-auth'
import { getStoneDefinitions } from '@/lib/stone-definitions-server'
import { revalidateTag,revalidatePath } from 'next/cache'
export async function setStoneMembership(color:string,product:string,mode:'include'|'exclude'|'auto'):Promise<{error?:string}> {
 const {db,user}=await adminDatabase()
 if(!(await getStoneDefinitions()).some(item=>item.id===color) || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(product) || !['include','exclude','auto'].includes(mode))return {error:'Confira a cor e o produto.'}
 const {data:row,error:readError}=await db.from('products').select('id,status,visibility').eq('id',product).maybeSingle()
 if(readError || !row)return {error:'Produto não encontrado.'}
 if(mode==='include' && (row.status!=='published' || !['visible','catalog'].includes(row.visibility)))return {error:'Publique o produto e habilite sua visibilidade antes de adicioná-lo.'}
 const result=mode==='auto'
  ? await db.from('serenity_stone_color_overrides_v1').delete().eq('color_id',color).eq('product_id',product)
  : await db.from('serenity_stone_color_overrides_v1').upsert({color_id:color,product_id:product,included:mode==='include',updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'color_id,product_id'})
 if(result.error)return {error:'Não foi possível salvar. Confira a instalação do SQL de cores.'}
 revalidateTag('catalog');revalidatePath(`/cores/${color}`);revalidatePath('/busca');revalidatePath('/admin/cores');revalidatePath('/')
 return {}
}

export async function setStoneMembershipBatch(color:string,products:string[],mode:'include'|'exclude'|'auto'):Promise<{error?:string}> {
 const {db,user}=await adminDatabase()
 const ids=Array.from(new Set(products))
 if(!(await getStoneDefinitions()).some(item=>item.id===color) || !ids.length || ids.length>200 || ids.some(id=>!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) || !['include','exclude','auto'].includes(mode))return {error:'Confira a seleção (máximo 200 peças por vez).'}
 const {data,error}=await db.from('products').select('id,status,visibility').in('id',ids)
 if(error || data?.length!==ids.length)return {error:'Não foi possível conferir os produtos.'}
 if(mode==='include' && data.some(row=>row.status!=='published' || !['visible','catalog'].includes(row.visibility)))return {error:'Só é possível adicionar produtos publicados e visíveis.'}
 const result=mode==='auto' ? await db.from('serenity_stone_color_overrides_v1').delete().eq('color_id',color).in('product_id',ids) : await db.from('serenity_stone_color_overrides_v1').upsert(ids.map(product_id=>({color_id:color,product_id,included:mode==='include',updated_by:user.id,updated_at:new Date().toISOString()})),{onConflict:'color_id,product_id'})
 if(result.error)return {error:'Não foi possível salvar a seleção.'}
 revalidateTag('catalog');revalidatePath('/admin/cores');revalidatePath(`/cores/${color}`);revalidatePath('/');revalidatePath('/busca')
 return {}
}
export async function createStoneColor(name:string,color:string):Promise<{error?:string;id?:string}> {
 const {db,user}=await adminDatabase()
 name=name.trim().replace(/\s+/g,' ')
 const id=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
 if(name.length<2 || name.length>60 || !id || id.length>80 || !/^#[0-9a-f]{6}$/i.test(color))return {error:'Informe um nome de 2 a 60 caracteres e uma cor válida.'}
 const {error}=await db.from('serenity_stone_colors_v1').insert({id,name,color,updated_by:user.id})
 if(error)return {error:error.code==='23505'?'Já existe uma cor com esse nome.':'Não foi possível criar. Confira se o SQL 02-cores-personalizadas.sql está instalado.'}
 revalidateTag('catalog');revalidatePath('/admin/cores');revalidatePath('/busca');revalidatePath('/')
 return {id}
}
