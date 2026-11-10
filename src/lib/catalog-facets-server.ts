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
  const options={headers:{apikey:key},next:{revalidate:60,tags:['catalog']}}
  let response=await fetch(`${base}/rest/v1/lunarity_catalog_facets_v1?${query}`,options)
  // Compatibility while the filter installation is being applied.
  if(response.status===404)response=await fetch(`${base}/rest/v1/serenity_filtered_catalog_v1?${query}`,options)
  if(!response.ok)throw Error('CATALOG_FACETS_QUERY')
  const page=await response.json()
  if(!Array.isArray(page))throw Error('CATALOG_FACETS_RESPONSE')
  rows.push(...page.map(row=>({...row,id:String(row.id),category_slugs:row.category_slugs || [],jewelry_filters:row.jewelry_filters || []})))
  if(page.length<500)return rows
 }
 throw Error('CATALOG_FACETS_LIMIT')
},['lunarity-catalog-facets-v2'],{revalidate:60,tags:['catalog']})
export async function getCatalogFacets(scope:string|string[],selection:FacetSelection){
 const [rows,products]=await Promise.all([metadata(),typeof scope==='string'?getStoreFilterProducts(scope):Promise.resolve(scope.map(id=>({id})))])
 const ids=new Set(products.map(row=>String(row.id)))
 return availableCatalogFilters(rows.filter(row=>ids.has(row.id)),selection,{areas:AREA_OPTIONS,subareas:getSubareaOptions(selection.area),jewelry:JEWELRY_OPTIONS},matchesAreaSelection)
}
