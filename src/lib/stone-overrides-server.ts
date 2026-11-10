import 'server-only'
import { unstable_cache } from 'next/cache'
export type StoneOverride = {color_id:string;product_id:string;included:boolean}
export const getStoneOverrides=unstable_cache(async():Promise<StoneOverride[]>=>{
 const url=process.env.SUPABASE_URL?.trim().replace(/\/$/,'')
 const key=process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
 if(!url || !key)return []
 const rows:StoneOverride[]=[]
 for(let offset=0;offset<20000;offset+=500){
  const query=new URLSearchParams({select:'color_id,product_id,included',order:'color_id.asc,product_id.asc',limit:'500',offset:String(offset)})
  const response=await fetch(`${url}/rest/v1/serenity_stone_overrides_public_v1?${query}`,{headers:{apikey:key},next:{revalidate:60,tags:['catalog']}})
  if(response.status===404 && offset===0)return []
  if(!response.ok)throw new Error('STONE_CURATIONS_READ')
  const page=await response.json() as StoneOverride[]
  if(!Array.isArray(page))throw new Error('STONE_CURATIONS_FORMAT')
  rows.push(...page)
  if(page.length<500)return rows
 }
 throw new Error('STONE_CURATIONS_LIMIT')
},['serenity-stone-overrides-v1'],{revalidate:60,tags:['catalog']})
