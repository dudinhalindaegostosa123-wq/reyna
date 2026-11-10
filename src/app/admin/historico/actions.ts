'use server'
import { revalidatePath } from 'next/cache'
import { adminDatabase } from '@/lib/admin-auth'
import { buildLegacyBundle } from '@/lib/legacy-import'
export interface LegacyImportState { error:string; summary?:{customers:number;orders:number;refunds:number;items:number;needs_review:number;already_imported:boolean} }
export async function importLegacyCsv(_previous:LegacyImportState,form:FormData):Promise<LegacyImportState> {
  const {db}=await adminDatabase()
  if(process.env.VERCEL_ENV!=='production') return {error:'Abra o painel no domínio oficial para importar em produção.'}
  const files=['customers','orders','items'].map(name=>form.get(name))
  if(files.some(file=>!(file instanceof File) || file.size===0)) return {error:'Selecione os três arquivos CSV.'}
  const uploads=files as File[]
  if(uploads.reduce((total,file)=>total+file.size,0)>3000000) return {error:'Os três arquivos juntos devem ter até 3 MB.'}
  let bundle:ReturnType<typeof buildLegacyBundle>
  try {
    const contents=await Promise.all(uploads.map(file=>file.text()))
    bundle=buildLegacyBundle(contents[0],contents[1],contents[2])
  } catch(error) {return {error:error instanceof Error?error.message:'Não foi possível ler os arquivos CSV.'}}
  try {
    const result=await db.rpc('serenity_legacy_import_v1',{p_bundle:bundle})
    if(result.error) {
      if(result.error.message?.includes('LEGACY_IMPORT_DIFFERENT_DATA')) return {error:'Já existe uma importação com outros dados. Preserve os registros e confira com a equipe antes de continuar.'}
      if(['PGRST202','PGRST205','42883','42P01'].includes(result.error.code || '')) return {error:'Execute primeiro o SQL da estrutura enviado na conversa e tente novamente.'}
      return {error:'Não foi possível confirmar a importação. Confira o histórico no painel antes de tentar novamente com os mesmos arquivos.'}
    }
    if(!result.data || !Number.isInteger(result.data.customers) || !Number.isInteger(result.data.orders)) return {error:'O resultado precisa de conferência. Atualize o histórico antes de tentar novamente.'}
    revalidatePath('/admin/historico');revalidatePath('/minha-conta','layout')
    return {error:'',summary:result.data}
  } catch {return {error:'A conexão falhou. Confira o histórico antes de tentar novamente; os mesmos arquivos não duplicam os registros.'}}
}
