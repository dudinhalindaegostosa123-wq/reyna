import type {SupabaseClient} from '@supabase/supabase-js'
export function priceCategorySlug(value:string){
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
}
export async function readAdminPriceOptions(db:Pick<SupabaseClient,'from'>):Promise<{materials:string[];categories:{slug:string;name:string}[];error:string|null}>{
 const materials=new Set<string>(),categories=new Map<string,string>()
 try{
  for(let offset=0;;offset+=500){
   const {data,error}=await db.from('products').select('id,material,categories').eq('status','published').neq('visibility','hidden').order('id').range(offset,offset+499)
   if(error)throw new Error('CATALOG_READ')
   for(const row of data || []){
    if(typeof row.material==='string' && row.material.trim())materials.add(row.material.trim())
    for(const name of Array.isArray(row.categories)?row.categories:[]){
     if(typeof name!=='string' || !name.trim())continue
     const slug=priceCategorySlug(name)
     if(slug)categories.set(slug,name.trim())
    }
   }
   if(!data || data.length<500)return {materials:Array.from(materials).sort((a,b)=>a.localeCompare(b,'pt-BR')),categories:Array.from(categories,([slug,name])=>({slug,name})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),error:null}
  }
 }catch{
  return {materials:[],categories:[],error:'Não foi possível carregar o catálogo agora. Confira a disponibilidade do Supabase e tente novamente.'}
 }
}
