import 'server-only'
import {unstable_cache} from 'next/cache'
import {getStoreFilterProducts} from './catalog-server'
import {AREA_OPTIONS,JEWELRY_OPTIONS,getSubareaOptions,matchesAreaSelection} from './catalog-area'
import {availableCatalogFilters,type FacetProduct,type FacetSelection} from './catalog-facets'
const metadata=unstable_cache(async()=>{
 const base=process.env.SUPABASE_URL?.trim().replace(/\/$/,''),key=process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
 if(!base || !key)throw Error('CATALOG_FACETS_CONFIGURATION')
 const rows:FacetProduct[]=[]
 for(let offset=0;offset<100000;offset+=500){
  const query=new URLSearchParams({select:'id,material,category_slugs,jewelry_filters',visibility:'in.(visible,catalog)',order:'id.asc',limit:'500',offset:String(offset)})
  const response=await fetch(`${base}/rest/v1/serenity_filtered_catalog_v1?${query}`,{headers:{apikey:key},cache:'no-store'})
  if(!response.ok)throw Error('CATALOG_FACETS_QUERY')
  const page=await response.json()
  if(!Array.isArray(page))throw Error('CATALOG_FACETS_RESPONSE')
  rows.push(...page.map(row=>({...row,category_slugs:row.category_slugs || [],jewelry_filters:row.jewelry_filters || []})))
  if(page.length<500)return rows
 }
 throw Error('CATALOG_FACETS_LIMIT')
},['serenity-catalog-facets-v1'],{revalidate:60,tags:['catalog']})
export async function getCatalogFacets(scope:string|string[],selection:FacetSelection){
 const [rows,products]=await Promise.all([metadata(),typeof scope==='string'?getStoreFilterProducts(scope):Promise.resolve(scope.map(id=>({id})))])
 const ids=new Set(products.map(row=>row.id))
 return availableCatalogFilters(rows.filter(row=>ids.has(row.id)),selection,{areas:AREA_OPTIONS,subareas:getSubareaOptions(selection.area),jewelry:JEWELRY_OPTIONS},matchesAreaSelection)
}
