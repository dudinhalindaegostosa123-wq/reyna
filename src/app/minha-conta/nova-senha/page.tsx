import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { customerAuth } from '@/lib/customer-auth'
import PasswordRecoveryForm from '@/components/PasswordRecoveryForm'
export const metadata: Metadata = { title: 'Nova senha', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'
export default async function NewPasswordPage() {
  const auth = customerAuth()
  const { data, error } = await auth.auth.getUser()
  if (error || !data.user || cookies().get('serenity-password-recovery')?.value !== data.user.id) redirect('/minha-conta/recuperar?erro=link')
  return <PasswordRecoveryForm reset />
}
