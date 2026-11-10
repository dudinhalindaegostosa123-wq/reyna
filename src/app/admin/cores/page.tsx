import {adminDatabase} from '@/lib/admin-auth'
import {getStoneCollections} from '@/lib/stone-collections-server'
import {getStoneCatalogMetadata,storageUrl} from '@/lib/catalog-server'
import ColorManager from './ColorManager'
export const dynamic='force-dynamic'
export default async function ColorsPage({searchParams={}}:{searchParams?:Record<string,string|string[]|undefined>}) {
 const {db}=await adminDatabase()
 const [groups,metadata]=await Promise.all([getStoneCollections(true),getStoneCatalogMetadata()])
 const color=groups.find(item=>item.id===searchParams.cor) || groups[0]
 if(!color)return <main className="p-8">Nenhuma cor disponível.</main>
 const overrides=await db.from('serenity_stone_color_overrides_v1').select('product_id,included').eq('color_id',color.id)
 if(overrides.error && !['42P01','PGRST205'].includes(overrides.error.code))throw new Error('STONE_CURATIONS_ADMIN_READ')
 const excluded=(overrides.data || []).filter(row=>!row.included).map(row=>row.product_id as string)
 const items=metadata.products.map(item=>({id:item.database_id,name:item.name,slug:item.slug,image:storageUrl(item.thumbnail_path || item.storage_path)}))
 return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8"><ColorManager key={color.id} color={color.id} colors={groups.map(({id,name,color,products})=>({id,name,color,count:products.length}))} items={items} memberIds={color.products.map(item=>item.database_id)} excludedIds={excluded} installed={!overrides.error}/></main>
}
