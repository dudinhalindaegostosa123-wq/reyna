import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireCustomer } from '@/lib/customer-auth'
import { legacyProfile } from '@/lib/legacy-history-server'
import ImportedProfileForm from './ImportedProfileForm'
export const dynamic='force-dynamic'
export const metadata:Metadata={title:'Concluir meu cadastro',robots:{index:false,follow:false}}
export default async function CompleteImportedProfile({searchParams={}}:{searchParams?:{retorno?:string}}) {
  const {auth}=await requireCustomer()
  const profile=await legacyProfile(auth)
  if(!profile.eligible || !profile.needs_profile) redirect('/minha-conta')
  return <main className="mx-auto max-w-lg px-5 py-14"><p className="text-xs tracking-[0.2em]">SERENITY PIERCINGS</p><h1 className="mt-5 text-3xl">Bem-vinda de volta</h1><p className="mt-4 text-sm leading-7 text-store-muted">Seu acesso por e-mail foi confirmado. Confira seus dados e complete o cadastro para comprar e acompanhar seus pedidos. Não é necessário refazer compras antigas.</p><ImportedProfileForm name={profile.name || ''} phone={profile.phone || ''} checkout={searchParams.retorno==='checkout'} /></main>
}
