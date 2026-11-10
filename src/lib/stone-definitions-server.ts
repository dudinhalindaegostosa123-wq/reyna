import 'server-only'
import { unstable_cache } from 'next/cache'
import { STONE_COLORS } from './stone-colors'
export type StoneDefinition={id:string;name:string;color:string}
export const getStoneDefinitions=unstable_cache(async():Promise<StoneDefinition[]>=>{
 const url=process.env.SUPABASE_URL?.trim().replace(/\/$/,'')
 const key=process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
 if(!url || !key)return [...STONE_COLORS]
 const response=await fetch(`${url}/rest/v1/serenity_stone_colors_public_v1?select=id,name,color&order=position.asc,id.asc&limit=1000`,{headers:{apikey:key},cache:'no-store'})
 if(response.status===404)return [...STONE_COLORS]
 if(!response.ok)throw new Error('STONE_COLORS_READ')
 const rows=await response.json()
 if(!Array.isArray(rows))throw new Error('STONE_COLORS_FORMAT')
 return rows
},['stone-definitions-v1'],{revalidate:60,tags:['catalog']})
